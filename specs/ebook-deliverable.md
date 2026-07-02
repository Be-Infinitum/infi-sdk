# Spec — Example: Ebook sale page with deliverable fulfillment

**Status:** Spec (planned). Target dir: `infi-sdk/examples/ebook-sale/`.

## Goal

A creator sells an ebook from a landing/sale page: visitor fills a form, pays, and
**receives the file** (Infi's deliverable workflow). One-time payment, digital delivery.
Goal (as always): find what the SDK must add so "sell a file and deliver it on payment"
is a few lines, not a REST tour.

## Stack

- Next.js (App Router) sale page + `@beinfi/nextjs`. Mostly public (no login required to
  buy — email captured on the form). shadcn for the page + form.

## Domain / billing model

- One **one-time product** `ebook` with a **deliverable** of kind `file` (uploaded to R2)
  or `link`. Price = flat one-time (BRL).
- Buyer identified by the email on the form (create/lookup customer).

## Infi integration — capability vs today

| Need | Backend | SDK today |
| --- | --- | --- |
| One-time product + price | `POST /metering/products` (type `item`, `one_time`) | ❌ not in SDK |
| Attach deliverable (file/link) | product deliverable (`internal/product/deliverable.go`) | ❌ not in SDK; also no OpenAPI create endpoint surfaced — **verify** |
| Create customer from form email | customer create/lookup | ❌ not in SDK (customers only via login exchange) |
| Create invoice + hosted checkout | `POST /billing/invoices` → `/pay/{slug}/invoices/{id}` (pix/boleto/card) | ❌ **gap** — no `infi.checkout()` |
| Deliver on payment | `payment.confirmed` webhook → download token → `GET /pay/{slug}/download/{token}` | ❌ SDK has no webhook verify, no delivery helper |

Backend supports the whole flow (checkout + deliverables + fulfillment download +
payment webhooks). The gap is entirely SDK ergonomics.

## Key flows

1. **Setup** (billing-as-code): product `ebook` (one_time) + upload the file deliverable +
   publish price.
2. **Sale page** → form (name, email) + "Comprar" → server creates/looks up the customer,
   creates an invoice for the ebook, redirects to hosted checkout `/pay/{slug}/invoices/{id}`.
3. **Pay** (pix/card) → `payment.confirmed` webhook → fulfillment provisions a download
   token → email the buyer the `/pay/{slug}/download/{token}` link (presigned file or link).
4. **Thank-you page** → show the download link once payment is confirmed (poll invoice
   status or land from checkout return URL).

## SDK gaps to fix (findings)

1. **`infi.checkout({ product|price, customer: { email } })`** returning a hosted URL — the
   single most-wanted primitive across ebook + AI-chat examples.
2. **`infi.customers.create/get`** (by email/externalId) — buying without login needs it.
3. **Deliverable management in the SDK** (`infi.products.deliverable.upload/attach`) and a
   `getDownloadUrl` helper; confirm the deliverable create endpoint exists in OpenAPI (the
   map found only the public download GET — **may be a backend gap too**).
4. **Webhook verification helper** (`verifyWebhook(req, secret)`) + typed events — every
   fulfillment flow needs it; currently absent.
5. **A one-call "sell this" recipe** (product + price + deliverable + checkout) — Polar's
   whole pitch; worth a high-level helper.

## Verification

Fill form → pay in test mode → `payment.confirmed` → download link works and serves the
file/link → invoice shows `paid`. Note every raw REST call and any missing backend
endpoint (esp. deliverable create).

## Open questions

- Deliver by email, on the thank-you page, or both?
- Coupons on the sale page (coupon package exists)?
- Is there a real deliverable *create/upload* API, or only the public download? (blocker to check first)
