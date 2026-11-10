import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { users, sessions } from "../lib/db/schema";
import { updateProfileSchema } from "../lib/validation";
import { requireAuth } from "../middleware/requireAuth";
import type { AppEnv } from "../index";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// Get current user profile
app.get("/me", async (c) => {
  const db = c.get("db");
  const user = c.get("user");

  const row = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      webhook: users.webhook,
      telegramChatId: users.telegramChatId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row[0]) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: row[0] });
});

// Update profile — partial updates allowed; every field optional.
// Password change delegates to better-auth (`auth.api.changePassword`)
// which hashes correctly into `account.password` and supports
// `revokeOtherSessions`. We additionally delete other sessions + bump
// `sessionVersion` in one DB update as defense-in-depth (SEC-01/02).
app.put("/me", zValidator("json", updateProfileSchema), async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const user = c.get("user");
  const { name, email, password, currentPassword, webhook, telegramChatId } =
    c.req.valid("json");

  let passwordChanged = false;
  let emailChanged = false;

  if (password) {
    if (!currentPassword) {
      return c.json({ error: "currentPassword is required when changing password" }, 400);
    }
    try {
      await auth.api.changePassword({
        body: { newPassword: password, currentPassword, revokeOtherSessions: true },
        headers: c.req.raw.headers,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid current password";
      // Avoid leaking whether password was wrong vs. other errors.
      if (/invalid/i.test(msg) || /401|403/i.test(msg)) {
        return c.json({ error: "Invalid current password" }, 400);
      }
      return c.json({ error: "Could not change password" }, 400);
    }
    passwordChanged = true;

    // Revoke any remaining sessions (changePassword already revokes others
    // when supported) and bump version for auditability.
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    await db
      .update(users)
      .set({
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));
  }

  if (email && email.toLowerCase() !== String(user.email).toLowerCase()) {
    if (!currentPassword) {
      return c.json({ error: "currentPassword is required when changing email" }, 400);
    }
    // Require current-password proof before delegating to better-auth.
    try {
      await auth.api.verifyPassword({
        body: { password: currentPassword },
        headers: c.req.raw.headers,
      });
    } catch {
      return c.json({ error: "Invalid current password" }, 400);
    }
    try {
      await auth.api.changeEmail({
        body: { newEmail: email.toLowerCase() },
        headers: c.req.raw.headers,
      });
      emailChanged = true;
    } catch (e) {
      return c.json({ error: "Could not change email" }, 400);
    }
    // No email verification: force re-login on all devices.
    await db
      .delete(sessions)
      .where(eq(sessions.userId, user.id));
    await db
      .update(users)
      .set({
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));
  }

  // Name + webhook direct update (only provided fields; webhook preserved
  // when omitted, cleared only on explicit null).
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (name !== undefined) updateData.name = name;
  if (webhook !== undefined) updateData.webhook = webhook;
  if (telegramChatId !== undefined) updateData.telegramChatId = telegramChatId;

  let updatedUser: {
    name: string | null;
    email: string;
    webhook: string | null;
    telegramChatId: string | null;
  } | null = null;

  if (
    Object.keys(updateData).length > 1 ||
    name !== undefined ||
    webhook !== undefined ||
    telegramChatId !== undefined
  ) {
    const rows = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning({
        name: users.name,
        email: users.email,
        webhook: users.webhook,
        telegramChatId: users.telegramChatId,
      });
    updatedUser = rows[0] ?? null;
    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }
  } else {
    // Only password/email changed — return current public profile.
    const rows = await db
      .select({
        name: users.name,
        email: users.email,
        webhook: users.webhook,
        telegramChatId: users.telegramChatId,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    updatedUser = rows[0] ?? null;
    if (!updatedUser) return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: updatedUser, passwordChanged, emailChanged, reloginRequired: passwordChanged || emailChanged });
});

export default app;
