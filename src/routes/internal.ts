import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { gameAccounts, users } from "../lib/db/schema";
import { decryptToken } from "../lib/crypto";
import { getTokenSecret } from "../lib/env";
import type { AppEnv } from "../index";

// Server-to-server endpoints used by the `daily` and `redeem` scripts.
// Authenticated with a shared secret (`X-API-Key`), NOT a user session,
// because those scripts must process every user's game accounts.
const app = new Hono<AppEnv>();

/** Constant-time-ish string comparison (no early exit on first mismatch). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

// All game accounts (every user) with decrypted cookie tokens + the owner's
// notification settings. Disabled entirely when SERVICE_API_KEY is unset.
app.get("/accounts", async (c) => {
  const expected = c.env.SERVICE_API_KEY;
  if (!expected) {
    return c.json({ error: "Not found" }, 404);
  }

  const provided = c.req.header("X-API-Key") ?? "";
  if (!timingSafeEqual(provided, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.get("db");
  const rows = await db
    .select({
      id: gameAccounts.id,
      name: gameAccounts.name,
      accountId: gameAccounts.accountId,
      cookieToken: gameAccounts.cookieToken,
      userId: gameAccounts.userId,
      createdAt: gameAccounts.createdAt,
      updatedAt: gameAccounts.updatedAt,
      webhook: users.webhook,
      telegramChatId: users.telegramChatId,
    })
    .from(gameAccounts)
    .leftJoin(users, eq(gameAccounts.userId, users.id))
    .orderBy(gameAccounts.name, gameAccounts.id);

  const secret = getTokenSecret(c.env);
  const accounts = await Promise.all(
    rows.map(async (row) => {
      // A row that fails to decrypt must not fail the whole batch; the script
      // skips accounts with a null token (and logs it).
      try {
        return { ...row, cookieToken: await decryptToken(row.cookieToken, secret) };
      } catch {
        return { ...row, cookieToken: null };
      }
    }),
  );

  c.header("Cache-Control", "no-store, private");
  c.header("Pragma", "no-cache");
  return c.json({ accounts });
});

export default app;
