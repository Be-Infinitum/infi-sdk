# Ebook sale — Infi SDK example

Sell a digital product from a landing page: fill a form → pay (hosted checkout) →
receive the file. Showcases the expanded `@beinfi/sdk@0.3.0`: **billing-as-code seed**,
**checkout**, **customers**, **invoices**, **deliverables**, and **webhook verification**.

Stack: Next.js 15 · Prisma (SQLite) · shadcn/ui · Tailwind v4.

## Run

```bash
cd ../.. && bun install && bun run build   # build the packages once
cd examples/ebook-sale
cp .env.example .env      # fill INFI_SECRET_KEY, INFI_SLUG, EBOOK_DOWNLOAD_URL
bunx prisma db push
bun run seed              # idempotent: creates the product + link deliverable via infi.sync
bun run dev               # http://localhost:3011
```

## Flow

1. **Seed** (`scripts/seed.ts`) — `infi.sync(defineBilling(...))` creates a one-time product
   with a flat price and a link deliverable. Safe to re-run.
2. **Buy** (`src/app/actions.ts`) — `infi.customers.create({ externalId: email })` then
   `infi.checkout({ slug, payerId, lineItems })` → redirect to `/thanks?invoice=…` which
   links to the hosted checkout and polls status.
3. **Deliver** (`src/lib/fulfill.ts`) — on `invoice.paid` (webhook via `infi.verifyWebhook`,
   or the poll path via `infi.invoices.get`), fetch `infi.products.deliverable.get(productId).url`
   and show the download.

## Prerequisites (real payments)

Backend at `INFI_API_URL`, a claimed sandbox (`sk_test_` + slug), and for the webhook path a
public URL + `POST /account/webhooks` secret in `INFI_WEBHOOK_SECRET`. Local demo works via
the poll path without a public webhook. See **FINDINGS.md** for the DX report.
