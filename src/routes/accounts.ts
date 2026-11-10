import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { gameAccounts } from "../lib/db/schema";
import { accountSchema, updateAccountSchema } from "../lib/validation";
import { encryptToken, decryptToken } from "../lib/crypto";
import { getTokenSecret } from "../lib/env";
import { requireAuth } from "../middleware/requireAuth";
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

function toPublicAccount(row: {
  id: string;
  name: string;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}) {
  return row;
}

// Get all accounts for current user (never returns cookieToken)
app.get("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");

  const accounts = await db
    .select({
      id: gameAccounts.id,
      name: gameAccounts.name,
      accountId: gameAccounts.accountId,
      createdAt: gameAccounts.createdAt,
      updatedAt: gameAccounts.updatedAt,
    })
    .from(gameAccounts)
    .where(eq(gameAccounts.userId, user.id));

  return c.json({ accounts });
});

// Create account
app.post("/", zValidator("json", accountSchema), async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const { name, accountId: accId, cookieToken } = c.req.valid("json");

  const encrypted = await encryptToken(cookieToken, getTokenSecret(c.env));

  try {
    const now = new Date().toISOString();
    const result = await db
      .insert(gameAccounts)
      .values({
        id: crypto.randomUUID(),
        name,
        accountId: accId,
        cookieToken: encrypted,
        userId: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: gameAccounts.id,
        name: gameAccounts.name,
        accountId: gameAccounts.accountId,
        createdAt: gameAccounts.createdAt,
        updatedAt: gameAccounts.updatedAt,
      });

    // Never echo cookieToken back (see SEC-07).
    return c.json({ account: toPublicAccount(result[0]) }, 201);
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message)) {
      // Per-user (userId, accountId) unique — only reveals duplicates
      // within the caller's own accounts, not other users' (SEC-06).
      return c.json({ error: "Account ID already exists for this user" }, 409);
    }
    throw e;
  }
});

// Update account
app.put("/:id", zValidator("json", updateAccountSchema), async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const { name, accountId: accId, cookieToken } = c.req.valid("json");

  const updateData: Record<string, unknown> = {
    name,
    accountId: accId,
    updatedAt: new Date().toISOString(),
  };

  if (cookieToken) {
    updateData.cookieToken = await encryptToken(cookieToken, getTokenSecret(c.env));
  }

  try {
    const result = await db
      .update(gameAccounts)
      .set(updateData)
      .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, user.id)))
      .returning({
        id: gameAccounts.id,
        name: gameAccounts.name,
        accountId: gameAccounts.accountId,
        createdAt: gameAccounts.createdAt,
        updatedAt: gameAccounts.updatedAt,
      });

    if (!result[0]) {
      return c.json({ error: "Account not found" }, 404);
    }

    return c.json({ account: result[0] });
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message)) {
      return c.json({ error: "Account ID already exists for this user" }, 409);
    }
    throw e;
  }
});

// Get cookie token (sensitive) — decrypt at rest, never cached.
app.get("/:id/token", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  const row = await db
    .select({ cookieToken: gameAccounts.cookieToken })
    .from(gameAccounts)
    .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, user.id)))
    .limit(1);

  if (!row[0]) {
    return c.json({ error: "Account not found" }, 404);
  }

  const plaintext = await decryptToken(row[0].cookieToken, getTokenSecret(c.env));
  c.header("Cache-Control", "no-store, private");
  c.header("Pragma", "no-cache");
  return c.json({ cookieToken: plaintext });
});

// Delete account
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await db
    .delete(gameAccounts)
    .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, user.id)))
    .returning({ id: gameAccounts.id });

  if (!result[0]) {
    return c.json({ error: "Account not found" }, 404);
  }

  return c.json({ success: true });
});

export default app;
