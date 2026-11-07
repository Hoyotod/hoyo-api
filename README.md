# hoyo-api

Hoyo API — Cloudflare Workers + Hono + D1 + Drizzle + better-auth.

Frontend lives in separate repo: https://github.com/hoyotod/hoyo

## Quickstart

```bash
cp .dev.vars.example .dev.vars  # fill in BETTER_AUTH_SECRET
pnpm install
pnpm dev              # wrangler dev on :8787
pnpm deploy           # wrangler deploy
pnpm db:migrate:local # apply local D1 migrations
```

## Routes

- `GET /` — API info
- `GET /api/health` — health check
- `ALL /api/auth/*` — better-auth (rate limited 30 req/60s)
- `GET /api/users/me` — profile
- `PUT /api/users/me` — update profile
- `GET /api/accounts` — list game accounts
- `POST /api/accounts` — create
- `PUT /api/accounts/:id` — update
- `GET /api/accounts/:id/token` — get cookie token
- `DELETE /api/accounts/:id` — delete
