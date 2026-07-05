# Marketplace billing example — agent runbook

Usage-billed marketplace-integration SaaS built on `@beinfi/sdk` + `@beinfi/nextjs`.
Billing model: one `integration` product (monthly subscription cycle) with three metered
events (`inventory_update`, `price_update`, `notification`), billed **per org at per-org
rate-cards** — the headline feature. Runs on **:3013**.

## Setup (run in order — do not skip step 4)

1. Build the workspace packages once — from the repo root: `bun install && bun run build`.
2. `cd examples/marketplace-billing && cp .env.example .env`, then fill:
   - `INFI_SECRET_KEY` — a `sk_test_...` for a claimed sandbox **tenant** (from the dashboard,
     or `beinfi keys create --env test`). The example can't provision without it.
   - `NEXT_PUBLIC_INFI_APP_SLUG` — the app slug (default `marketplace-demo`).
   - `INFI_API_URL` — Infi API (default `http://localhost:8088`).
   - `NEXT_PUBLIC_INFI_AUTH_BASE_URL` — the Infi **frontend** that serves hosted login
     (default `http://localhost:3000`), NOT the API.
3. `bunx prisma db push` (or `bun run db:push`) — create the local SQLite DB + client.
4. `bun run setup` — **idempotent tenant provisioning** (`scripts/seed.ts`):
   - `infi.sync(defineBilling(...))` → the `integration` product + its three meters,
   - `infi.apps.create/update` → the identity app with `allowedOrigins`/`redirectUris` for
     `http://localhost:3013`,
   - then enrolls the demo orgs, sets per-org rate-cards, and subscribes each with a
     backdated anchor (so the first monthly period is already invoiceable).
   Re-run any time you change the slug or origins. (`bun run seed` is the same command.)
5. `bun run ingest` — emit the metered events for the seeded orgs.
6. `bun run dev` → http://localhost:3013.

## Why step 4 is mandatory

Hosted login enrolls the logged-in identity as a **customer of one of the tenant's products**
(`GetOrCreateCustomerForIdentity` picks `products[0]`). With **zero products** the login
session resolves *without* a customer, and the app bounces to `/login` — even though
`/identity/exchange` and `/identity/session` both return 200. Seeding the product fixes login
AND defines the meters the app charges on.

Separately, hosted login is served by the **frontend**, so the identity app must be
provisioned (`infi.apps.create/update`) with this example's origin (`http://localhost:3013`)
and callback (`http://localhost:3013/callback`) allowlisted, or the redirect is rejected.
Skipping `bun run setup` = "logs in but lands back on /login" (or a rejected redirect).

## Auth flow (front-direct hosted login)

Login button → `@beinfi/nextjs` `Login` (`src/app/api/auth/login/route.ts`) → redirects the
browser to the Infi **frontend** `{NEXT_PUBLIC_INFI_AUTH_BASE_URL}/identity/{slug}/login`
(not the API) → email-code form → `/callback` (`Callback`, `src/app/callback/route.ts`)
exchanges the `?code`, sets the session cookie, redirects to `/`.

Gotchas:
- **Auth codes expire in 60s.** Don't reload an old `/callback?code=…` tab — do a fresh login.
- A failed exchange lands on the callback's error handling, not a session.

## Prereqs that must be running

- Infi backend at `INFI_API_URL` (:8088) — exchange + metering + billing.
- Infi frontend at `NEXT_PUBLIC_INFI_AUTH_BASE_URL` (:3000) — it serves `/identity/{slug}/login`.
