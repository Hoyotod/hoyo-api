# AGENTS.md

## Project

Hoyo API — Cloudflare Workers + Hono + D1 + Drizzle + better-auth. Companion frontend lives in a separate repo: `hoyo`.

## Critical Commands

```bash
pnpm dev              # wrangler dev on :8787
pnpm deploy           # wrangler deploy
pnpm db:generate      # drizzle-kit generate
pnpm db:migrate:local # apply migrations locally
pnpm db:migrate       # apply migrations to remote D1
```

Always use `pnpm` (never `npm`/`npx`).

## Design Constraints

- **Do NOT add dependencies** without asking first
- Always use `pnpm` over `npm`, `pnpx` over `npx`

## Data Model

Source of truth: `src/lib/db/schema.ts` (Drizzle / SQLite).

Tables: `user`, `session`, `account` (better-auth authAccounts), `verification`, `game_account` (custom Hoyoverse accounts), `login_attempt`.

Dates are `text()` (ISO 8601 UTC) for better-auth compatibility — not `integer({ mode: "timestamp_ms" })`. `session` requires `token` (unique, not null), `createdAt`, `updatedAt`.

## Required Endpoints

1. `GET /` — API info JSON
2. `GET /api/health` — `{ ok: true }`
3. `ALL /api/auth/*` — better-auth handler
4. `GET /api/users/me` - current user profile (id, name, email, webhook, telegramChatId, createdAt)
5. `PUT /api/users/me` - update profile; password change bumps `sessionVersion`
6. `GET /api/accounts` - list game accounts (cookieToken omitted)
7. `POST /api/accounts` - create (name, accountId, cookieToken required)
8. `PUT /api/accounts/:id` - edit (cookieToken optional)
9. `GET /api/accounts/:id/token` - fetch sensitive cookie token on demand
10. `DELETE /api/accounts/:id` - delete
11. `GET /api/internal/accounts` - server-to-server: all users' game accounts + decrypted tokens + owner `webhook`/`telegramChatId` (`X-API-Key: SERVICE_API_KEY`; 404 when the secret is unset)

## Security Notes

- **CORS**: only whitelisted origins (frontend Pages + localhost). Requests without `Origin` header (curl, mobile) return `*`.
- **Rate limiting**: 30 req/60s per IP on `/api/auth/*` via Workers Rate Limiting binding.
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Input validation**: Zod with max lengths + trimming; email normalized to lowercase.
- **Parameterized queries**: user ID never string-interpolated into raw SQL.
- **Session invalidation**: password change increments `User.sessionVersion`.

## Architecture

- **Hono** app entry: `src/index.ts`
- **Auth**: `src/lib/auth/index.ts` — better-auth with explicit schema mapping `{ user, session, account: authAccounts, verification }`, `validateSchema: false`, `trustedOrigins` includes frontend
- **DB**: `src/lib/db/index.ts` — Drizzle client from D1 binding
- **Schema**: `src/lib/db/schema.ts`
- **D1**: `hoyo-db` (`f61952f7-8548-4035-bfb8-e218885fb3b8`, APAC)
- **Path alias**: `@/*` maps to project root (see `tsconfig.json`)

## Environment Variables

Required in `.dev.vars` (local) / Wrangler secrets (prod):
```
BETTER_AUTH_SECRET="..."  # openssl rand -base64 32
BETTER_AUTH_URL="https://hoyo-api.haiueom.workers.dev"  # prod baseURL
SERVICE_API_KEY="..."     # optional; enables /api/internal/* for daily/redeem
```

## Key Files

- `wrangler.toml` — Worker config (`name = "hoyo-api"`), D1 binding, rate limit
- `src/index.ts` — Hono entry, CORS, rate limit middleware, root + health routes
- `src/lib/env.ts` — `Env` bindings type (DB, BETTER_AUTH_SECRET, BETTER_AUTH_URL, rate limiter)
- `src/lib/auth/index.ts` — better-auth setup with `trustedOrigins`
- `src/lib/db/index.ts` — `createDb(d1)` drizzle client
- `src/lib/db/schema.ts` — Drizzle schema (text dates)
- `src/routes/users.ts` - user profile routes
- `src/routes/accounts.ts` - game account CRUD routes
- `src/routes/internal.ts` - server-to-server bulk account read (`X-API-Key`)
- `drizzle.config.ts` — drizzle-kit config (sqlite dialect, d1-http driver)
- `drizzle/` — generated migrations
