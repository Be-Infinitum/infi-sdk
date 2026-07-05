# Ebook sale example — agent runbook

Sell a digital product from a landing page on `@beinfi/sdk` + `@beinfi/nextjs`: fill a form
→ pay on the **hosted checkout** → receive the file. **One-time checkout, no login.**
Billing model: a single `one_time` `item` product (`ebook-lean-side-project`) with a flat
BRL price and a `link` deliverable. Runs on **:3011**.

## Setup (run in order)

1. Build the workspace packages once — from the repo root: `bun install && bun run build`.
2. `cd examples/ebook-sale && cp .env.example .env`, then fill:
   - `INFI_SECRET_KEY` — a `sk_test_...` for a claimed sandbox **tenant** (from the dashboard,
     or `beinfi keys create --env test`). The example can't seed without it.
   - `INFI_SLUG` — the merchant slug (default `ebook-demo`), used to build the hosted checkout
     URL `/pay/{slug}/invoices/{id}`.
   - `INFI_API_URL` — Infi API (default `http://localhost:8088`).
   - `INFI_PAY_BASE_URL` — the Infi **frontend** that serves the hosted checkout page
     (default `http://localhost:3000`), NOT the API.
   - `EBOOK_DOWNLOAD_URL` / `EBOOK_PRICE_BRL` — the delivered file + price (read by the seed).
   - `INFI_WEBHOOK_SECRET` — only for the webhook delivery path (see below); optional for the
     local poll-based demo.
3. `bunx prisma db push` — create the local SQLite DB + Prisma client.
4. `bun run seed` — **idempotent product seed** (`scripts/seed.ts`):
   `infi.sync(defineBilling(...))` creates the `one_time` product, its flat price, and the
   `link` deliverable. Safe to re-run; re-run after changing the price or download URL.
5. `bun run dev` → http://localhost:3011.

## No app provisioning (no hosted login)

This example does **not** use hosted login — there is no `Login`, `getSession`,
`getCurrentUser`, or `/callback` anywhere in `src`. Buyers are identified by the email they
type into the form (`customer: { externalId: email }`), not by an authenticated identity
session. So there is **no `infi.apps` provisioning** here (no `allowedOrigins`/`redirectUris`,
no identity-customer enrollment). The only tenant setup is the product seed in step 4.

## Flow

1. **Seed** (`scripts/seed.ts`) — `infi.sync(defineBilling(...))` → the product + flat price +
   link deliverable. Idempotent.
2. **Buy** (`src/app/actions.ts`) — `infi.checkout({ slug, productId, customer })` enrolls the
   customer (creates if new) and opens a product-linked invoice, returns `{ invoice, url }`.
   The order is stored locally (Prisma) and the browser redirects to `/thanks?invoice=…`,
   which links to the hosted checkout (`url`) and polls invoice status.
3. **Deliver** (`src/lib/fulfill.ts`) — on `payment.confirmed` (webhook via `infi.verifyWebhook`,
   `src/app/api/webhooks/infi/route.ts`, or the poll path via `infi.invoices.get`), fetch
   `infi.products.deliverable.get(productId).url` and show the download.
   Note: the event is `payment.confirmed` (header `X-Webhook-Event-Type`), there is no
   `invoice.paid` event.

## Prereqs that must be running

- Infi backend at `INFI_API_URL` (:8088) — seed, checkout, invoice status, deliverable.
- Infi frontend at `INFI_PAY_BASE_URL` (:3000) — it serves the hosted checkout page
  `/pay/{slug}/invoices/{id}` the buyer is sent to. Needed to actually pay.
- For the webhook delivery path only: a public URL + a `POST /account/webhooks` secret in
  `INFI_WEBHOOK_SECRET`. The local demo works via the poll path without a public webhook.

## Gotchas

- **`bun run seed` is required before first buy.** `actions.ts` looks up the product by
  `PRODUCT_KEY`; if it isn't seeded the checkout throws "Product not seeded — run `bun run seed`."
- The `checkout` call can't know the invoice id before creating it, so `/thanks` is poll-based
  rather than using a `successUrl` redirect — expected, not a bug.
