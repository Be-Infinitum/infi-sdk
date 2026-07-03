# CRM example — agent runbook

Small CRM (contacts + deals pipeline) built on `@beinfi/sdk` + `@beinfi/nextjs`. Billing
model: charge **per lead ingested** (meter `leads_ingested`) — every contact created is
metered. Runs on **:3010**.

## Setup (run in order — do not skip step 4)

1. Build the workspace packages once — from the repo root: `bun install && bun run build`.
2. `cd examples/crm && cp .env.example .env`, then fill:
   - `INFI_SECRET_KEY` — a `sk_test_...` for a claimed sandbox **tenant** (from the dashboard,
     or `beinfi keys create --env test`). The example can't provision without it.
   - `NEXT_PUBLIC_INFI_APP_SLUG` — the app slug (default `crm-demo`).
   - `INFI_API_URL` — Infi API (default `http://localhost:8088`).
   - `NEXT_PUBLIC_INFI_AUTH_BASE_URL` — the Infi **frontend** that serves hosted login
     (default `http://localhost:3000`), NOT the API.
3. `bunx prisma db push` — create the local SQLite DB + client.
4. `bun run setup` — **idempotent tenant provisioning** (`scripts/setup.ts`):
   - `infi.sync(defineBilling(...))` → the `CRM` product + `leads_ingested` meter,
   - `infi.apps.create/update` → the identity app with `allowedOrigins`/`redirectUris` for
     `http://localhost:3010`.
   Re-run any time you change the slug or origins.
5. `bun run dev` → http://localhost:3010.

## Why step 4 is mandatory

Hosted login enrolls the logged-in identity as a **customer of one of the tenant's products**.
With **zero products** the login session resolves *without* a customer, and `getCurrentUser`
(keyed on `customer.id`) bounces to `/login` — even though `/identity/exchange` and
`/identity/session` both return 200. Seeding the product fixes login AND defines the meter the
app charges on. Skipping `bun run setup` = "logs in but lands back on /login".

## Auth flow (front-direct hosted login)

Login button → `@beinfi/nextjs` `Login` → redirects the browser to the Infi **frontend**
`{NEXT_PUBLIC_INFI_AUTH_BASE_URL}/identity/{slug}/login` (not the API) → email-code form →
`/callback` (`Callback` with `errorUrl: "/login"`) exchanges the `?code`, sets the session
cookie, redirects to `/`. `getCurrentUser` (`src/lib/auth.ts`) resolves the cookie via
`getSession`.

Gotchas:
- **Auth codes expire in 60s.** Don't reload an old `/callback?code=…` tab — do a fresh login.
- A failed exchange bounces to `/login?error=…&message=…` (shown as a banner), not a JSON page.

## Prereqs that must be running

- Infi backend at `INFI_API_URL` (:8088).
- Infi frontend at `NEXT_PUBLIC_INFI_AUTH_BASE_URL` (:3000) — it serves `/identity/{slug}/login`.
