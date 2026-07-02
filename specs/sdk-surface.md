# Spec — @beinfi/sdk surface expansion

**Status:** P1 + P2 + P3 **implemented** in `@beinfi/sdk@0.3.0`. P1/P2: `checkout`,
`verifyWebhook`, `usage`, `customers.credits`/`rateCards`/`create`/`get`, `products` catalog,
`invoices`. P3: `products.deliverable.*` (openapi + wrappers), backend product natural-key
(`key` column, migration 000031 + threaded through create), and billing-as-code
`defineBilling()`/`infi.sync()` (idempotent by `key`, `{ plan }` dry-run). Target: `@beinfi/sdk`
(+ types via codegen). Unblocks all example specs.

## Context

The backend already implements catalog, per-customer rate-cards, credits, hosted checkout,
invoices, deliverables, webhooks, and a rating engine. But `@beinfi/sdk` today exposes only
auth (`sendEmailCode`/`verifyEmailCode`/`exchangeCode`/`getSession`) + metering (`track`/
`trackBatch`). Every example (ai-chat, marketplace, ebook, billing-as-code) is blocked on the
same thing: the SDK doesn't surface the backend, so integrators fall back to raw REST. This
spec defines the full SDK surface and a phased build order.

## Design principles

- **Namespaced resource clients**: `infi.products.*`, `infi.customers.rateCards.*`,
  `infi.customers.credits.*`, `infi.usage.*`, `infi.invoices.*`, plus top-level
  `infi.checkout()` and `infi.verifyWebhook()`. Discoverable at scale.
- **Types from OpenAPI codegen** (`packages/sdk/src/generated/openapi.ts`): reuse
  `components["schemas"]` aliases in `types.ts` — no hand-typed payloads. Same pattern as
  `track`/`getSession`. Re-run `bun run codegen` when the backend spec changes.
- **Secret-key, server-side** for all new methods (Bearer `sk_`), reusing `#requireSecretKey`,
  `parseErrorResponse`, `InfiError`. Exceptions: public checkout read + `verifyWebhook`.
- **Thin `fetch` wrappers.** Start in `client.ts`; split into `src/resources/*.ts` once P2 lands.

## Proposed surface (method → endpoint → type)

### Catalog — `infi.products`
| Method | Endpoint | Types |
| --- | --- | --- |
| `create(input)` | `POST /metering/products` | `CreateProductRequest` → `Product` |
| `list()` / `get(id)` / `update(id, patch)` | `GET/GET/PATCH /metering/products[/{id}]` | `Product` |
| `versions.create/list/publish` | `.../versions[/{id}/publish]` | `CreateVersionRequest` → `Version` |
| `prices.create/list` | `.../versions/{id}/prices` | `PriceInput` → `Price` |
| `meters.create/list` | `.../meters` | `CreateMeterRequest` → `Meter` |
| `commitment.set` | `PUT .../versions/{id}/commitment` | → `Version` |
| `deliverable.presign/save/get/delete` | `POST\|PUT\|GET\|DELETE /metering/products/{id}/deliverable` | (EXISTS; item + one_time only) |

### Customers — `infi.customers`
| Method | Endpoint | Types |
| --- | --- | --- |
| `rateCards.set(customerId, input)` | `POST /metering/customers/{id}/rate-cards` | `PriceInput`-shape → `RateCard` — **per-org pricing** |
| `rateCards.list/delete` | `GET/DELETE .../rate-cards[/{id}]` | `RateCard` |
| `credits.balance(customerId)` | `GET /metering/customers/{id}/credit` | `CreditSummary` |
| `credits.grant(customerId, {amount, reference})` | `POST .../credit` | `CreditSummary` |
| `create/get` | — | **backend gap**: customers exist only via login exchange today; needed by ebook's no-login buy. Follow-up. |

### Usage — `infi.usage`
- `get({ customerId, from, to })` → `GET /metering/usage` → `UsageReport`. Dashboards + cost projection.

### Invoices — `infi.invoices`
- `create(CreateInvoiceRequest)`, `list`, `get`, `send` (finalize+email), `void`,
  `generateFromSubscription(subscriptionId)` → `POST /billing/subscriptions/{id}/invoices`,
  `charge(invoiceId, { method })` → `Payment`. All under `/billing/*`, Bearer `sk_`.

### Checkout — `infi.checkout()`  (the most-wanted primitive)
- `infi.checkout({ payerId | customer, lineItems | priceId, currency, dueDate? })` →
  creates an invoice (`POST /billing/invoices`) and returns the hosted pay URL
  (`/pay/{slug}/invoices/{id}`, methods pix/boleto/card). Used by ai-chat (credit packs),
  ebook (one-time), marketplace (period invoice link).

### Webhooks — `infi.verifyWebhook()`
- `infi.verifyWebhook({ id, timestamp, signature, body }, secret) → { type, data }` (throws on
  mismatch/expiry). **Must mirror `internal/webhook/signer.go` byte-for-byte:**
  - signed content = `event_id + "." + timestamp + "." + rawBody`
  - `HMAC-SHA256`, **hex**, constant-time compare; header `X-Webhook-Signature` value `v1=<hex>`
  - `X-Webhook-Timestamp` (unix seconds), 5-minute tolerance (replay bound)
  - other headers: `X-Webhook-Id`, `X-Webhook-Event-Type`
- Ship a typed event union: `customer.created`, `invoice.finalized|sent|paid|voided|uncollectible`,
  `payment.confirmed|failed|refunded|chargeback`.

## Verified facts (design constraints)

- **Webhook scheme** above is exact (from `signer.go`; `Verify` is already exported/tested — the
  SDK helper reimplements the same math in TS).
- **Deliverable endpoints EXIST** (`internal/product/handler.go`: presign/save/get/delete) — not
  a gap; just wrap. Restricted to `item` + `one_time` products.
- **Idempotency keys:** `meters` are unique on `(product_id, name)` ✓; **`products` have NO
  natural key** (only uuid; `name` not unique per tenant). Billing-as-code `sync` therefore needs
  a backend migration adding `UNIQUE (tenant_id, key)` (or `name`) on products. **One backend
  prerequisite.**
- **Self-serve credit purchase ABSENT** → model as `checkout(credit-pack)` →
  `payment.confirmed` webhook → `credits.grant`. No new endpoint required.

## Phasing (build order)

- **P1 — unblocks ai-chat + ebook:** `checkout()`, `customers.credits.balance/grant`,
  `usage.get`, `verifyWebhook`.
- **P2 — unblocks marketplace:** catalog (`products/versions/prices/meters`),
  `customers.rateCards.*`, `invoices.*`.
- **P3:** `products.deliverable.*`; backend product natural-key migration; then billing-as-code
  `defineBilling()/sync()` (own spec) builds on P2.
- Cross-cutting: split `client.ts` → `resources/*.ts` after P2; codegen stays the type source;
  version bump `@beinfi/sdk` 0.2 → 0.3 on first new surface.

## Verification

Each method exercised against a local backend (`:8088`) with a sandbox `sk_test_`; typecheck
green; the example specs' setup/integration steps rewrite to SDK calls with zero raw REST.
`verifyWebhook` unit-tested against a payload signed by `internal/webhook/signer.go`.

## Non-goals (future)

Subscriptions CRUD, dunning/retry config, multi-currency FX, entitlement/benefit groups,
usage forecasting.
