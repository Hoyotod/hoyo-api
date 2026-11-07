import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initAuth } from "./lib/auth";
import { createDb } from "./lib/db";
import usersRoute from "./routes/users";
import accountsRoute from "./routes/accounts";
import type { Env } from "./lib/env";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: ReturnType<typeof createDb>;
    auth: ReturnType<typeof initAuth>;
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
  // Allow requests without origin (curl, mobile apps)
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin header (curl, mobile apps)
      if (!origin) return "*";
      if (allowedOrigins.includes(origin)) return origin;
      // Reject unknown origins
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
});

// Initialize DB and Auth for each request
app.use("*", async (c, next) => {
  const db = createDb(c.env.DB);
  const auth = initAuth(c.env);
  c.set("db", db);
  c.set("auth", auth);
  await next();
});

// Rate limiting for auth endpoints
app.use("/api/auth/*", async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const { success } = await c.env.LOGIN_ROUTE_RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return c.json({ error: "Too many requests" }, 429);
  }
  await next();
});

// Health check
app.get("/api/health", (c) => c.json({ ok: true }));

// Root route
app.get("/", (c) => c.json({
  name: "HoyoAccount API",
  version: "1.0.0",
  endpoints: {
    auth: "/api/auth/*",
    users: "/api/users/*",
    accounts: "/api/accounts/*",
    health: "/api/health"
  }
}));

// Auth routes
app.all("/api/auth/*", async (c) => {
  const auth = c.get("auth");
  return auth.handler(c.req.raw);
});

// API routes
app.route("/api/users", usersRoute);
app.route("/api/accounts", accountsRoute);

export default app;
