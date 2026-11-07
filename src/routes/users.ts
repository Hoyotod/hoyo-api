import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { users } from "../lib/db/schema";
import { hashPassword } from "../lib/crypto";
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

// Get current user profile
app.get("/me", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      webhook: users.webhook,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user[0]) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: user[0] });
});

// Update profile
const updateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().transform(e => e.toLowerCase().trim()),
  password: z.string().min(8).max(128).optional(),
  webhook: z.string().url().max(2048).nullable().optional(),
});

app.put("/me", zValidator("json", updateSchema), async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { name, email, password, webhook } = c.req.valid("json");

  const updateData: Record<string, unknown> = {
    name,
    email,
    webhook: webhook ?? null,
    updatedAt: new Date().toISOString(),
  };

  const passwordChanged = !!password;

  if (passwordChanged) {
    updateData.password = await hashPassword(password);
  }

  try {
    const result = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, session.user.id))
      .returning({
        name: users.name,
        email: users.email,
        webhook: users.webhook,
      });

    if (!result[0]) {
      return c.json({ error: "User not found" }, 404);
    }

    if (passwordChanged) {
      await db
        .update(users)
        .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
        .where(eq(users.id, session.user.id));
    }

    return c.json({ user: result[0], passwordChanged });
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint")) {
      return c.json({ error: "Email already in use" }, 409);
    }
    throw e;
  }
});

export default app;
