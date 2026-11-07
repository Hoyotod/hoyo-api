// Environment bindings accessed via Cloudflare Worker context
// These are injected by Wrangler at runtime

export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  LOGIN_ROUTE_RATE_LIMITER: RateLimit;
}

// Helper to get env from global context (set by worker)
declare global {
  var __ENV__: Env | undefined;
}

export function getEnv(): Env {
  if (typeof globalThis.__ENV__ !== "undefined") {
    return globalThis.__ENV__;
  }
  // Fallback for local dev without worker context
  throw new Error("Environment not initialized. Running outside Worker context?");
}

export function setEnv(env: Env) {
  globalThis.__ENV__ = env;
}
