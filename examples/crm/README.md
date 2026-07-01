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
bun run dev               # http://localhost:3010
```

## Prerequisites (real auth)

- The Infi backend reachable at `INFI_API_URL` (default `http://localhost:8088`).
- A **claimed sandbox** giving you `sk_test_...` (`INFI_SECRET_KEY`) and an app slug
  (`NEXT_PUBLIC_INFI_APP_SLUG`).
- Your app origin allowlisted on the app: `allowed_origins` includes
  `http://localhost:3010`, `redirect_uris` includes `http://localhost:3010/callback`
  (set on claim onboarding or via MCP `beinfi_configure_app`).

## How auth works here

`Login` → hosted login → `Callback`. Because the `infi_session` token is opaque and
there's no introspection endpoint, `Callback.onAuth` persists the customer and a
`Session(token → user)` row; `src/lib/auth.ts#getCurrentUser` looks the cookie token up.
See **FINDINGS.md** — this is the main thing the SDK should own for us.
