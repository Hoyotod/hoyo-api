import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { initAuth } from "./lib/auth";
import { createDb } from "./lib/db";
import { users, gameAccounts } from "./lib/db/schema";
import { isBlocked, recordFailure, recordSuccess } from "./lib/rate-limit";
import usersRoute from "./routes/users";
import accountsRoute from "./routes/accounts";
import internalRoute from "./routes/internal";
import type { Env } from "./lib/env";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: ReturnType<typeof createDb>;
    auth: ReturnType<typeof initAuth>;
    user: { id: string; email: string; name?: string | null } & Record<string, unknown>;
    session: { id: string; userId: string } & Record<string, unknown>;
  };
};

const app = new Hono<AppEnv>();

// Middleware
app.use("*", logger());
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "https://hoyo.haiueom.workers.dev",
  "https://hoyo-api.haiueom.workers.dev",
  "https://hoyo-web.haiueom.workers.dev",
  "https://hoyo.pages.dev",
  "https://hoyo.haiueom.pages.dev",
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin header (curl, mobile apps). Browsers
      // always send Origin, so this does not widen browser attack surface;
      // unknown browser origins are denied (no ACAO header -> browser blocks).
      if (!origin) return "*";
      if (allowedOrigins.includes(origin)) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  c.res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

// Initialize DB and Auth for each request
app.use("*", async (c, next) => {
  const db = createDb(c.env.DB);
  const auth = initAuth(c.env);
  c.set("db", db);
  c.set("auth", auth);
  await next();
});

function getClientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  const cf = c.req.header("CF-Connecting-IP");
  if (cf) return cf;
  const xff = c.req.header("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return "unknown";
}

// Rate limiting for auth endpoints (30 req/60s per IP via Workers binding)
// plus DB-backed brute-force tracking (5 failures / 15 min per IP).
app.use("/api/auth/*", async (c, next) => {
  const ip = getClientIp(c);
  const { success } = await c.env.LOGIN_ROUTE_RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const db = c.get("db");
  if (await isBlocked(db, `ip:${ip}`)) {
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();

  if (c.res.status === 200 || c.res.status === 201) {
    await recordSuccess(db, `ip:${ip}`).catch(() => {});
  } else if (
    c.res.status === 400 ||
    c.res.status === 401 ||
    c.res.status === 403 ||
    c.res.status === 422
  ) {
    await recordFailure(db, `ip:${ip}`).catch(() => {});
  }
});

// Sensitive token reads get the same Workers rate limiter (per-IP) so a
// stolen session cannot brute-force account IDs at unlimited speed.
app.use("/api/accounts/*/token", async (c, next) => {
  const ip = getClientIp(c);
  const { success } = await c.env.LOGIN_ROUTE_RATE_LIMITER.limit({ key: `token:${ip}` });
  if (!success) {
    return c.json({ error: "Too many requests" }, 429);
  }
  await next();
});

// Server-to-server bulk account read (daily/redeem scripts).
app.use("/api/internal/*", async (c, next) => {
  const ip = getClientIp(c);
  const { success } = await c.env.LOGIN_ROUTE_RATE_LIMITER.limit({
    key: `internal:${ip}`,
  });
  if (!success) {
    return c.json({ error: "Too many requests" }, 429);
  }
  await next();
});

// Generic error handling — never leak stacks / driver messages.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

// Health check
app.get("/api/health", (c) => c.json({ ok: true }));

// Public aggregate stats (rate-limited via Workers binding, short-cached)
app.get("/api/stats", async (c) => {
  const ip = getClientIp(c);
  const { success } = await c.env.LOGIN_ROUTE_RATE_LIMITER.limit({ key: `stats:${ip}` });
  if (!success) {
    return c.json({ error: "Too many requests" }, 429);
  }
  const db = c.get("db");
  const [userRow] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [accountRow] = await db.select({ count: sql<number>`count(*)` }).from(gameAccounts);
  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    totalUsers: Number(userRow?.count ?? 0),
    totalGameAccounts: Number(accountRow?.count ?? 0),
  });
});

// Root route (no version disclosure)
app.get("/", (c) =>
  c.json({
    name: "HoyoAccount API",
    endpoints: {
      auth: "/api/auth/*",
      users: "/api/users/*",
      accounts: "/api/accounts/*",
      health: "/api/health",
    },
  }),
);

// Auth routes
app.all("/api/auth/*", async (c) => {
  const auth = c.get("auth");
  return auth.handler(c.req.raw);
});

// API routes
app.route("/api/users", usersRoute);
app.route("/api/accounts", accountsRoute);
app.route("/api/internal", internalRoute);

export default app;
