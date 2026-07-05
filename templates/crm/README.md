# CRM — Infi SDK example

A small but real CRM (contacts + deals pipeline) built on `@beinfi/sdk` +
`@beinfi/nextjs`, to exercise login, per-user data and **usage metering** end to end.

Stack: Next.js 15 (App Router) · Prisma (SQLite) · shadcn/ui · Tailwind v4.

Metering model: **charge by leads ingested** — every contact created fires
`infi.track({ meter: "leads_ingested" })`.

## Run

```bash
# from the monorepo root, build the packages once
cd ../.. && bun install && bun run build

# set up this example
cd examples/crm
cp .env.example .env      # fill INFI_SECRET_KEY + NEXT_PUBLIC_INFI_APP_SLUG
bunx prisma db push       # creates dev.db + generates the client
bun run setup             # provisions the identity app (slug + origins + redirect) via infi.apps
bun run dev               # http://localhost:3010
```

`bun run setup` registers the app in code with `infi.apps.create` — the local origin
(`http://localhost:3010`) and callback (`/callback`) allowlisted — so hosted login resolves.
It is idempotent (re-runs update the app), so run it again after changing the slug or origins.

## Prerequisites (real auth)

- The Infi backend reachable at `INFI_API_URL` (default `http://localhost:8088`).
- The Infi **frontend** running at `NEXT_PUBLIC_INFI_AUTH_BASE_URL` (default `http://localhost:3000`)
  — it serves the hosted login page (`/identity/{slug}/login`). The login button links straight
  there; there is no backend redirect hop.
- A **claimed sandbox** giving you `sk_test_...` (`INFI_SECRET_KEY`) and an app slug
  (`NEXT_PUBLIC_INFI_APP_SLUG`). `bun run setup` handles the origin/redirect allowlist for you
  (`allowed_origins` ⊇ `http://localhost:3010`, `redirect_uris` ⊇ `http://localhost:3010/callback`).

## How auth works here

`Login` → hosted login → `Callback`. Because the `infi_session` token is opaque and
there's no introspection endpoint, `Callback.onAuth` persists the customer and a
`Session(token → user)` row; `src/lib/auth.ts#getCurrentUser` looks the cookie token up.
See **FINDINGS.md** — this is the main thing the SDK should own for us.
