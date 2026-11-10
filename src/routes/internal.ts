import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, inArray, sql } from "drizzle-orm";
import { gameAccounts, redeemedCodes, users } from "../lib/db/schema";
import { redemptionBatchSchema } from "../lib/validation";
import { decryptToken } from "../lib/crypto";
import { getTokenSecret } from "../lib/env";
import type { AppEnv } from "../index";

// Server-to-server endpoints used by the `daily` and `redeem` scripts.
// Authenticated with a shared secret (`X-API-Key`), NOT a user session,
// because those scripts must process every user's game accounts.
const app = new Hono<AppEnv>();

/** Constant-time string comparison. Length check uses XOR to avoid early exit. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // XOR lengths into diff so mismatch still iterates full loop
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// Disabled entirely when SERVICE_API_KEY is unset (404, same as before).
app.use("*", async (c, next) => {
  const expected = c.env.SERVICE_API_KEY;
  if (!expected) {
    return c.json({ error: "Not found" }, 404);
  }

  const provided = c.req.header("X-API-Key") ?? "";
  if (!timingSafeEqual(provided, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

// All game accounts (every user) with decrypted cookie tokens + the owner's
// notification settings.
app.get("/accounts", async (c) => {
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

// Per-account redemption history. The `redeem` script uses this to skip codes
// that already reached a terminal state for a specific game account.
app.get("/redemptions", async (c) => {
  const db = c.get("db");
  const redemptions = await db
    .select({
      gameAccountId: redeemedCodes.gameAccountId,
      game: redeemedCodes.game,
      code: redeemedCodes.code,
      uid: redeemedCodes.uid,
      status: redeemedCodes.status,
      createdAt: redeemedCodes.createdAt,
      updatedAt: redeemedCodes.updatedAt,
    })
    .from(redeemedCodes)
    .orderBy(
      redeemedCodes.gameAccountId,
      redeemedCodes.game,
      redeemedCodes.code,
    );

  c.header("Cache-Control", "no-store, private");
  c.header("Pragma", "no-cache");
  return c.json({ redemptions });
});

// Bulk upsert terminal results. Unknown/deleted account rows are skipped
// instead of failing the whole batch.
app.post(
  "/redemptions",
  zValidator("json", redemptionBatchSchema),
  async (c) => {
    const db = c.get("db");
    const { redemptions } = c.req.valid("json");

    const accountIds = [...new Set(redemptions.map((r) => r.gameAccountId))];
    // D1 allows at most 100 bound parameters per query; chunk the id lookup
    // for users with many game accounts.
    const existingIds = new Set<string>();
    for (let i = 0; i < accountIds.length; i += 90) {
      const existing = await db
        .select({ id: gameAccounts.id })
        .from(gameAccounts)
        .where(inArray(gameAccounts.id, accountIds.slice(i, i + 90)));
      for (const row of existing) {
        existingIds.add(row.id);
      }
    }

    const now = new Date().toISOString();
    const values = redemptions
      .filter((r) => existingIds.has(r.gameAccountId))
      .map((r) => ({
        id: crypto.randomUUID(),
        gameAccountId: r.gameAccountId,
        game: r.game,
        code: r.code,
        uid: r.uid ?? null,
        status: r.status,
        createdAt: now,
        updatedAt: now,
      }));

    // D1 allows at most 100 bound parameters per query; 8 columns per row.
    const chunkSize = 10;
    for (let i = 0; i < values.length; i += chunkSize) {
      await db
        .insert(redeemedCodes)
        .values(values.slice(i, i + chunkSize))
        .onConflictDoUpdate({
          target: [
            redeemedCodes.gameAccountId,
            redeemedCodes.game,
            redeemedCodes.code,
          ],
          set: {
            uid: sql`excluded.uid`,
            status: sql`excluded.status`,
            updatedAt: sql`excluded.updatedAt`,
          },
        });
    }

    return c.json({
      recorded: values.length,
      skipped: redemptions.length - values.length,
    });
  },
);

// Clear history globally or for one account (`redeem -r`).
app.delete("/redemptions", async (c) => {
  const db = c.get("db");
  const gameAccountId = c.req.query("gameAccountId");

  const deleted = gameAccountId
    ? await db
        .delete(redeemedCodes)
        .where(eq(redeemedCodes.gameAccountId, gameAccountId))
        .returning({ id: redeemedCodes.id })
    : await db.delete(redeemedCodes).returning({ id: redeemedCodes.id });

  return c.json({ deleted: deleted.length });
});

export default app;
