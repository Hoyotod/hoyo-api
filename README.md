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
- `GET /api/internal/accounts` — **all** game accounts (every user, decrypted tokens) for the `daily`/`redeem` scripts; requires `X-API-Key: $SERVICE_API_KEY`

## Server-to-server access

`daily` and `redeem` read accounts through `GET /api/internal/accounts`. That route is
disabled unless the Worker has a `SERVICE_API_KEY` secret, and every request must send it
in the `X-API-Key` header:

```bash
openssl rand -base64 32 | wrangler secret put SERVICE_API_KEY
curl -H "X-API-Key: $KEY" https://hoyo-api.haiueom.workers.dev/api/internal/accounts
```

The response contains plaintext `cookieToken` values — treat the key like a database
password and never expose it to the browser.
