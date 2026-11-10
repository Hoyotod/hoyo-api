import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../index";

export type AuthUser = { id: string; email: string; name?: string | null } & Record<string, unknown>;

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});

// Helper for routes that need the user without middleware (e.g. in handlers
// where we need to keep explicit control). Prefer `requireAuth` middleware.
export async function getUser(c: { get: (k: "auth") => AppEnv["Variables"]["auth"]; req: { raw: Request } }) {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  return session?.user ?? null;
}
