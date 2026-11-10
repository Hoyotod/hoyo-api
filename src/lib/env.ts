// Environment bindings accessed via Cloudflare Worker context
// These are injected by Wrangler at runtime

export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  // Optional dedicated key for token encryption. When absent we derive
  // the encryption key from BETTER_AUTH_SECRET (see `src/lib/crypto.ts`).
  TOKEN_ENCRYPTION_KEY?: string;
  // Shared secret for server-to-server clients (daily/redeem scripts) that
  // need every user's game accounts. When unset the internal route is disabled.
  SERVICE_API_KEY?: string;
  LOGIN_ROUTE_RATE_LIMITER: RateLimit;
}

/** Secret used for `cookieToken` encryption (dedicated key wins, else auth secret). */
export function getTokenSecret(env: Env): string {
  return env.TOKEN_ENCRYPTION_KEY || env.BETTER_AUTH_SECRET;
}
