# AI Chat example — agent runbook

AI chat where each turn burns **prepaid credits** (credits = tokens, 1:1) on `@beinfi/sdk`.
First **non-Next.js** example: **Vite SPA (:5173)** + **Hono server (:3012)** + AI SDK (`ai` +
`@ai-sdk/anthropic`) + Prisma (SQLite) for the wallet/purchase maps. The SPA proxies `/api` and
`/callback` to the Hono API, which holds the secret keys.

## Setup (run in order — do not skip step 4)

1. Build the workspace packages once — from the repo root: `bun install && bun run build`.
2. `cd examples/ai-chat && cp .env.example .env`, then fill:
   - `ANTHROPIC_API_KEY` — a `sk-ant-...` for the chat model.
   - `INFI_SECRET_KEY` — a `sk_test_...` for a claimed sandbox **tenant** (from the dashboard,
     or `beinfi keys create --env test`). The example can't provision without it.
   - `INFI_SLUG` — the app slug (default `ai-chat-demo`).
   - `INFI_WEBHOOK_SECRET` — a `whsec_...` for verifying the `payment.confirmed` webhook.
   - `INFI_API_URL` — Infi API (default `http://localhost:8088`).
   - `INFI_AUTH_BASE_URL` — the Infi **frontend** that serves hosted login
     (default `http://localhost:3000`), NOT the API.
   - `APP_URL` — the SPA origin (default `http://localhost:5173`); login redirects + checkout
     return here.
3. `bunx prisma db push` — create the local SQLite DB + client.
4. `bun run seed` — **idempotent tenant provisioning** (`scripts/seed.ts`):
   - `infi.sync(defineBilling(...))` → the `ai-chat` product (prepaid + `tokens` meter),
   - `infi.apps.create/update` → the identity app with `allowedOrigins`/`redirectUris` for
     `http://localhost:5173` (+ `/callback`), read from `APP_URL`.
   Re-run any time you change the slug or origins.
5. `bun run dev` → web on **http://localhost:5173**, API on **http://localhost:3012**.

## Why step 4 is mandatory

Hosted login enrolls the logged-in identity as a **customer of one of the tenant's products**.
With **zero products** the login session resolves *without* a customer, so `currentEnrollment`
(keyed on `session.customer?.id`) returns null and every `/api/*` route 401s — the SPA sits on
the login screen even though the code exchange succeeded. Seeding also registers the app's
origin/callback allowlist, without which hosted login has nowhere to redirect back to. Skipping
`bun run seed` = "logs in but lands back on the login screen".

## Auth flow (front-direct hosted login, no `@beinfi/nextjs`)

Login button (`href="/api/auth/login"`) → Hono `buildHostedLoginUrl({ slug, redirectTo:
"${APP_URL}/callback", authBaseUrl: INFI_AUTH_BASE_URL })` → redirects the browser to the Infi
**frontend** `{INFI_AUTH_BASE_URL}/identity/{slug}/login` (not the API) → email-code form →
`${APP_URL}/callback` (proxied by Vite to the Hono API) → `infi.exchangeCodeFromRequest` sets the
`infi_session` cookie → redirects to the SPA. `currentEnrollment` (`server/index.ts`) resolves the
cookie via `infi.getSession`, and on first login **enrolls** the customer in the `ai-chat` product
+ grants starter credits.

Gotchas:
- **Auth codes expire in 60s.** Don't reload an old `/callback?code=…` tab — do a fresh login.
- A failed exchange silently falls through and redirects to the SPA, which shows the login screen.

## Prereqs that must be running

- Infi backend at `INFI_API_URL` (:8088).
- Infi frontend at `INFI_AUTH_BASE_URL` (:3000) — it serves `/identity/{slug}/login`.
