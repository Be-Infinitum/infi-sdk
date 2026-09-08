# Spec — Digital delivery: delivering what was paid for, per line

**Status:** spec (planned), written 2026-09-07 over the shipped feature. Fulfillment exists
(ADR 0036, `internal/fulfillment`, migration `000024` now in genesis) and is verified below as it
is. This spec records what it does today, and what `specs/infi-store.md` P2 changes: **a payment
can now pay for several products, and delivery follows each line, not the invoice.**
`specs/ebook-deliverable.md` is the example that sits on top of this and is unchanged in intent.
**This is not Infi Fulfillment.** That reserved name (docs ADR 0008) is the physical-goods module: catalogue with
variants, address, shipping, order, shipment, tracking, stock — specified separately. This file covers the digital
deliverable that ADR 0008 says Fulfillment will adopt retroactively.

## What fulfillment is

A merchant attaches **one deliverable** to a `one_time` + `item` product: a file uploaded straight
to a private bucket, or an external link. When a payment on an invoice for that product confirms,
a worker mints a **grant**, a random capability token bound to `(payment, deliverable)`, and emails
the buyer a link `/pay/{slug}/download/{token}` that redirects to a fresh short-lived presigned
URL or to the stored link. A full refund or chargeback **revokes** every grant on the payment; the
link then answers 410 and the webhook says `accessRevoked: true`. The merchant's server can list an
invoice's grants with a `billing:read` key; the buyer never sees the token except in their mailbox.

That is the whole feature and every property of it is deliberate. What follows changes exactly one
assumption inside it.

## Verified facts (as shipped)

| Fact | Where |
|---|---|
| One deliverable per product, `UNIQUE (product_id)`, kind `file \| link` | `genesis.up.sql:786-799,1652` |
| Only a `one_time` + `item` product may carry one; the guard is pure and tested | `internal/product/deliverable.go:178-195` |
| Upload is browser → R2 by presigned PUT; the API never sees bytes; a nil R2 client makes file routes 503 | ADR 0036; `deliverable.go:91` |
| Fulfillment is an **outbox consumer** on `payment.confirmed`, in the worker, never in the payment transaction | `internal/fulfillment/fulfillment.go:1-6,84`; ADR 0036 |
| **`Resolve` walks invoice → `invoices.customer_id` (one enrollment) → that product's deliverable**, and returns one row | `internal/fulfillment/store.go:23-43`; `db/queries/deliverables.sql:26-38` |
| A grant is `UNIQUE (payment_id, deliverable_id)`; the upsert is `ON CONFLICT DO NOTHING`, and a replay finds the existing grant and sends no second email | `deliverables.sql:40-49`; `fulfillment.go:108-116` |
| The email is one link, bilingual, deduped on `payment:{id}:download`; a send failure leaves `email_sent_at` NULL so a retry resends | `fulfillment.go:120-160` |
| Download: public `GET /pay/{slug}/download/{token}`, 302 to presigned GET or link; revoked → 410 `download_revoked` | `fulfillment/handler.go:150-160`; `exception.go:12` |
| Merchant read: `GET /invoices/{invoiceID}/deliverable`, `billing:read`, returns `grants[]` with `paymentId, token, downloadUrl, emailSentAt, revokedAt`; **no productId** | `fulfillment/handler.go:55-80` |
| The token is deliberately **not** on the public `/pay/{slug}/invoices/{id}` response, because invoice UUIDs travel in URLs, history and support tickets | `fulfillment/handler.go:60-66` |
| `payment.refunded` / `payment.chargeback` carry `accessRevoked` | `openapi.yaml:5093-5105` |
| The SDK's `DeliverableGrant` says *"One per payment"* in its doc comment and has no `productId` | `packages/sdk/src/resources/invoices.ts:12-39` |
| The paid checkout page shows the receipt PDF and **no download button**, by the same reasoning as the token's absence from the public read | `checkout-success-receipt.tsx:92-94` |
| An invoice is created bound to one enrollment: `createEnrollmentInvoice(enrollmentID)` → `invoices.customer_id`; `invoices.payer_id` exists beside it | `internal/invoice/store.go:361-373` |
| Twelve query sites join `product_customers pc ON pc.id = i.customer_id` | `grep` over `db/queries/*.sql` |
| `invoice_line_items` has `price_id` and `meter_id` and **no `product_id`** | `genesis.up.sql:406-418` |

## The one assumption, and the change

Every row above is sound for one product per payment. The store's cart (`infi-store.md` P2) pays
for N products with one payment, and the single assumption that breaks is the one in `Resolve`:
*the invoice's enrollment tells me the product*. With N products there are N enrollments and the
invoice cannot name one without privileging it.

**Decision: a line names its product, and fulfillment resolves per line.**

### Schema

```sql
-- invoice_line_items: the product a line sells, when it sells one.
ALTER TABLE invoice_line_items ADD COLUMN product_id uuid REFERENCES products (id);
CREATE INDEX invoice_line_items_product_idx ON invoice_line_items (product_id) WHERE product_id IS NOT NULL;

-- invoices: a cart invoice binds to the PAYER, not to one enrollment.
-- customer_id stays for every existing path (link, API, subscription billing). It is
-- already nullable in genesis; what is missing is the rule that one party is named.
ALTER TABLE invoices ADD CONSTRAINT invoices_has_a_party
    CHECK (customer_id IS NOT NULL OR payer_id IS NOT NULL);
ALTER TABLE invoices ADD COLUMN source text
    CHECK (source IN ('link', 'store', 'api', 'billing', 'rail'));

-- deliverable_grants: unchanged. UNIQUE (payment_id, deliverable_id) already
-- means "N deliverables on one payment are N grants".
```

`CreateProductInvoice` (one product) keeps writing `customer_id` and now also writes
`product_id` on its single line, so **every** invoice line that sells a product says which, old
path and new. Usage and subscription lines keep `product_id` NULL: they name a price or a meter.

### Resolution

`Resolve(invoice)` becomes `ResolveLines(invoice)`:

```sql
-- name: ResolveDeliverablesForInvoice :many
SELECT pd.id AS deliverable_id, li.product_id, c.id AS customer_id,
       COALESCE(c.email,''), COALESCE(c.name,''), t.slug
FROM invoices i
JOIN invoice_line_items li  ON li.invoice_id = i.id AND li.product_id IS NOT NULL
JOIN product_deliverables pd ON pd.product_id = li.product_id
JOIN customers c             ON c.id = COALESCE(i.payer_id, (SELECT customer_id FROM product_customers WHERE id = i.customer_id))
JOIN tenants t               ON t.id = i.tenant_id
WHERE i.id = $1 AND i.tenant_id = $2
GROUP BY pd.id, li.product_id, c.id, c.email, c.name, t.slug;   -- two lines of one product → one grant
```

The old query is kept **only as a fallback for invoices whose lines predate `product_id`**, and is
deleted once a backfill from `invoices.customer_id → product_customers.product_id` has stamped
every historical single-product line. The backfill is one UPDATE, and it is what lets the fallback
go.

For each resolved deliverable the fulfiller does what it does today: `UpsertGrant(payment,
deliverable)`, idempotent, one token each. **N deliverables, N grants, one payment.**

### The email

One message per payment, listing every grant, in the order of the invoice's lines:

```
Olá Ana,

Obrigado pela sua compra! Seus produtos:
Thank you for your purchase! Your products:

  Aquarela 101 — https://…/pay/atelie/download/tok1
  Kit de pincéis (guia PDF) — https://…/pay/atelie/download/tok2

Estes links são pessoais. / These links are personal to you.
```

Dedupe key stays `payment:{id}:download`. The rule that makes the replay safe changes shape:
today "grant already existed → no email"; now **"no grant was created in this pass → no email"**.
If a replay creates a grant that a crashed first pass missed, the email goes out with **all**
grants, and `email_sent_at` is stamped on every one it listed. A grant with `email_sent_at` NULL
after the pass is the signal a retry looks for.

### Revocation and the webhook

Unchanged in mechanism: a full refund or chargeback revokes every grant on the payment;
`accessRevoked` stays a boolean. A partial refund revokes nothing, as today. **Per-line
revocation is a non-goal**: it needs a refund that names lines, which is a refund spec.

### Reads

`GET /invoices/{invoiceID}/deliverable` gains `productId` and `deliverableId` per grant, so a
merchant's server can hand each buyer the right link. `DeliverableGrant` in the SDK gains the same
two fields and its comment stops saying "one per payment". The public invoice read and the paid
page still carry no token, for the reason the handler already states.

### Store, cart and the contact step

`infi-store.md` is the consumer: `POST /store/{slug}/carts` enrolls per product, opens one invoice
bound to the payer with `source = 'store'`, writes `product_id` on every line, and redirects to
the existing invoice checkout. The store only lists `one_time` + `item` products in a cart, which
is exactly the set that may carry a deliverable, so nothing in the guard changes.

## What does not change, on purpose

- **One deliverable per product.** A "bundle" is several products in one cart, not several files on
  one product. The `UNIQUE (product_id)` stays.
- **`one_time` + `item` only.** Subscription and usage delivery are entitlements, not downloads,
  and they live in the wallet and meter, not here.
- **The token reaches the buyer by email, and the merchant by key.** Not by the public invoice
  read, not by the paid page. Widening it because a cart made the mailbox feel slow is the
  wrong fix; the right one is the merchant's thank-you page calling the authenticated read.
- **Worker, outbox, idempotent, never in the payment transaction.**

## Phasing

Bundled with `infi-store.md` **P2**, in this order inside it: schema (`product_id`, nullable
`customer_id` with the CHECK, `source`); `CreateProductInvoice` writes `product_id`; backfill;
`ResolveLines` with fallback; N-grant email; read and SDK fields; then the cart endpoint that
produces the first N-line invoice. The order matters: every step before the cart is a no-op for
existing merchants and can ship alone.

## Verification

- An existing single-product link purchase produces exactly one grant and one email, byte-identical
  in count to today, with `product_id` now set on its line.
- A historical invoice with `product_id` NULL on its line still fulfils through the fallback; after
  the backfill, the fallback query has zero callers and is deleted in the same PR that proves it.
- A two-product cart paid once: two grants on one payment, one email listing both, each download
  redirecting to its own file; a replay of `payment.confirmed` creates nothing and sends nothing.
- Two lines of the same product in one cart: **one** grant, not two.
- A cart where one product has a deliverable and the other does not: one grant, an email naming one
  product, no error.
- A full refund revokes both grants and the webhook says `accessRevoked: true`; both links 410.
- A crashed first pass that minted one of two grants: the retry mints the second and sends one
  email listing both; `email_sent_at` is set on both.
- `GET /invoices/{id}/deliverable` returns two grants with distinct `productId`s; the public
  invoice read and the paid page return no token.

## Open questions

1. **Is `invoices.customer_id` `NOT NULL` today?** Genesis shows it nullable; the twelve enrollment
   joins behave as if it were not. Each of the twelve gets a look in the P2 PR, and any that reads
   the enrollment for something other than the product (dashboard statements, dunning, webhooks)
   is switched to the payer.
2. **Backfill scope.** Every invoice ever, or only paid ones with a deliverable? Every line with a
   single-enrollment invoice is cheap and makes the fallback deletable; recommend every one.
3. **Should the email include the receipt PDF link?** It is one more line and the receipt already
   exists; the buyer's mailbox becomes the one place with everything they bought.
