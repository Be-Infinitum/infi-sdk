# next-email-code example — agent runbook

Minimal **pre-auth email-code** demo for `@beinfi/sdk` + `@beinfi/nextjs`. One page
(`src/app/page.tsx`) showing three co-equal ways to sign in with a 6-digit email code:

- **Embedded** — `<InfiLogin>` drop-in React component (email → code → redirect).
- **Hosted** — `startHostedLogin()` redirects the browser to the Infi frontend login page.
- **Headless** — call `infi.sendEmailCode` / `infi.verifyEmailCode` from your own UI.

There is **no post-login dashboard**: every mode ends at `/callback`, which exchanges the
`?code=…`, sets the session cookie, and redirects to `/`. The point of the example is the
login itself. Runs on **:3009**. No database.

## Setup (run in order — do not skip step 3)

1. Build the workspace packages once — from the repo root: `bun install && bun run build`.
2. `cd examples/next-email-code && cp .env.example .env`, then fill:
   - `INFI_SECRET_KEY` — a `sk_test_...` for a claimed sandbox **tenant** (from the dashboard,
     or `beinfi keys create --env test`). Setup can't provision without it.
   - `NEXT_PUBLIC_INFI_APP_SLUG` — the app slug (default `sdk-test`).
   - `INFI_API_URL` / `NEXT_PUBLIC_INFI_API_URL` — Infi API (default `http://localhost:8088`).
   - `NEXT_PUBLIC_INFI_AUTH_BASE_URL` — the Infi **frontend** that serves hosted login
     (default `http://localhost:3000`), NOT the API.
3. `bun run setup` — **idempotent tenant provisioning** (`scripts/setup.ts`):
   - `infi.sync(defineBilling(...))` → a minimal `Email Code Demo` product + `email_sends` meter,
   - `infi.apps.create/update` → the identity app with `allowedOrigins`/`redirectUris` for
     `http://localhost:3009`.
   Re-run any time you change the slug or origins.
4. `bun run dev` → http://localhost:3009.

## Why step 3 is mandatory

Login enrolls the identity as a **customer of one of the tenant's products** (it picks
`products[0]`). With **zero products** the session resolves *without* a customer — even though
`/identity/exchange` and `/identity/session` both return 200 — so any app keyed on the customer
bounces back to `/login`. Seeding a product fixes that. Separately, `infi.apps.create/update`
allowlists this app's origin + `/callback`; without it the login page rejects the slug/redirect.
Skipping `bun run setup` = login round-trips but never resolves a customer.

## Auth flow (front-direct)

- **Hosted:** `startHostedLogin({ slug, redirectTo, authBaseUrl })` sends the browser to the Infi
  **frontend** `{NEXT_PUBLIC_INFI_AUTH_BASE_URL}/identity/{slug}/login` (not the API).
- **Embedded / Headless:** talk to the API directly via `sendEmailCode` / `verifyEmailCode`
  (`NEXT_PUBLIC_INFI_API_URL`), then land on the returned `redirectUrl`.
- All modes converge on `/callback` (`Callback` from `@beinfi/nextjs`, `successUrl: "/"`), which
  exchanges the `?code`, sets the session cookie, and redirects to `/`.

Gotchas:
- **Email codes expire in 60s.** Don't reuse an old code or reload a stale `/callback?code=…`
  tab — start a fresh login.
- Hosted vs embedded/headless hit different hosts: hosted uses the frontend
  (`NEXT_PUBLIC_INFI_AUTH_BASE_URL`), the others use the API (`NEXT_PUBLIC_INFI_API_URL`).

## Prereqs that must be running

- Infi backend at `INFI_API_URL` (:8088) — exchange + email-code endpoints.
- Infi frontend at `NEXT_PUBLIC_INFI_AUTH_BASE_URL` (:3000) — serves `/identity/{slug}/login`
  (needed for the Hosted mode).
