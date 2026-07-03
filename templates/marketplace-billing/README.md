# Marketplace billing — per-org usage pricing

A company that syncs inventory across marketplaces and bills each customer **by usage, at prices
that differ per organization**. The same `inventory_update` event costs a different amount for a
"standard" org vs a "premium" org, via a per-customer **rate-card**. At period close, each org gets
a usage invoice, rated by the Infi backend.

Fourth example on `@beinfi/sdk` (Next.js + Prisma). Exercises the last of the SDK surface:
catalog + `customers.rateCards`, `usage.get`, subscriptions, and `invoices.generateFromSubscription`.

Stack: Next.js (App Router) + `@beinfi/nextjs` (operator login) · Prisma (SQLite) · shadcn.

## Run

```bash
cd ../.. && bun install && bun run build   # build the packages once
cd examples/marketplace-billing
cp .env.example .env      # fill INFI_SECRET_KEY, INFI_SLUG (a claimed sandbox)
bunx prisma db push
bun run seed              # sync the `integration` product + 3 meters, onboard 2 orgs
bun run ingest            # emit equal event volume for both orgs
bun run dev               # dashboard on :3013 — log in, then "Fechar período e faturar"
```

## How it works

- **Seed** (`scripts/seed.ts`): `infi.sync(defineBilling(...))` creates the `integration` product
  with meters `inventory_update` / `price_update` / `notification` and per-unit base prices
  (published version). Each org is then `infi.products.enroll`-ed, gets a full
  `infi.customers.rateCards.set` per meter (its own prices), and is `infi.products.subscribe`-d with
  a **backdated anchor** so its first monthly period is already ended (invoiceable immediately).
- **Ingest** (`scripts/ingest.ts`): `infi.trackBatch(...)` sends the **same** volume for both orgs,
  timestamped inside the backdated period. Metering keys on the org's **external id**; everything
  else (rate-cards, usage, invoicing) keys on the **enrollment id** — do not mix them.
- **Dashboard** (`app/(app)/page.tsx`): per org, `infi.usage.get` shows usage totals + the
  server-rated cost, alongside the org's `rateCards.list`. "Fechar período e faturar" runs
  `infi.invoices.generateFromSubscription` → `send`, and the resulting line items render inline.

Because volume is identical, the two invoices differ **only** by the rate-card delta — that's the
whole point of per-org pricing.

Prereqs for real runs: backend at `INFI_API_URL`, a claimed sandbox (`sk_test_` + slug), your origin
allowlisted. See **FINDINGS.md** for the DX report.
