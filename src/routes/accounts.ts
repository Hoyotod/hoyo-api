import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { gameAccounts } from "../lib/db/schema";
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

// Get all accounts for current user
app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const accounts = await db
    .select({
      id: gameAccounts.id,
      name: gameAccounts.name,
      accountId: gameAccounts.accountId,
      createdAt: gameAccounts.createdAt,
      updatedAt: gameAccounts.updatedAt,
    })
    .from(gameAccounts)
    .where(eq(gameAccounts.userId, session.user.id));

  return c.json({ accounts });
});

// Create account
const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  accountId: z.string().min(1).max(255).trim(),
  cookieToken: z.string().min(1).max(2048),
});

app.post("/", zValidator("json", createSchema), async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { name, accountId: accId, cookieToken } = c.req.valid("json");

  try {
    const now = new Date().toISOString();
    const result = await db.insert(gameAccounts).values({
      id: crypto.randomUUID(),
      name,
      accountId: accId,
      cookieToken,
      userId: session.user.id,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return c.json({ account: result[0] }, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      return c.json({ error: "Account ID already exists" }, 409);
    }
    throw e;
  }
});

// Update account
const updateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  accountId: z.string().min(1).max(255).trim(),
  cookieToken: z.string().min(1).max(2048).optional(),
});

app.put("/:id", zValidator("json", updateSchema), async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const id = c.req.param("id");
  
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { name, accountId: accId, cookieToken } = c.req.valid("json");

  const updateData: Record<string, unknown> = {
    name,
    accountId: accId,
    updatedAt: new Date().toISOString(),
  };

  if (cookieToken) {
    updateData.cookieToken = cookieToken;
  }

  try {
    const result = await db
      .update(gameAccounts)
      .set(updateData)
      .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, session.user.id)))
      .returning();

    if (!result[0]) {
      return c.json({ error: "Account not found" }, 404);
    }

    return c.json({ account: result[0] });
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      return c.json({ error: "Account ID already exists" }, 409);
    }
    throw e;
  }
});

// Get cookie token (sensitive)
app.get("/:id/token", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const id = c.req.param("id");
  
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const account = await db
    .select({ cookieToken: gameAccounts.cookieToken })
    .from(gameAccounts)
    .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, session.user.id)))
    .limit(1);

  if (!account[0]) {
    return c.json({ error: "Account not found" }, 404);
  }

  return c.json({ cookieToken: account[0].cookieToken });
});

// Delete account
app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const id = c.req.param("id");
  
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const result = await db
    .delete(gameAccounts)
    .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, session.user.id)))
    .returning();

  if (!result[0]) {
    return c.json({ error: "Account not found" }, 404);
  }

  return c.json({ success: true });
});

export default app;
