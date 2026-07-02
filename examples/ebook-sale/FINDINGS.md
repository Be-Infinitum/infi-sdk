# Ebook sale on the Infi SDK — DX report

Second example, built on the **expanded** SDK (`@beinfi/sdk@0.3.0`): sell a one-time
product and deliver a file on payment. Same lens: would an agent nail this first try?

## Verdict: **9 / 10** — the new surface carries it

"Sell a file and deliver on payment" reduced to a handful of typed SDK calls. No raw REST.

| Step | Effort (1 trivial → 5 painful) | Call |
| --- | --- | --- |
| Seed product + price + link deliverable | **1** | `infi.sync(defineBilling(...))` — one call, idempotent |
| Buy (no login) | **1** | `infi.customers.create({ externalId, email })` |
| Create checkout | **1** | `infi.checkout({ slug, payerId, lineItems })` → `{ invoice, url }` |
| Confirm payment | **1** | `infi.invoices.get(id)` (poll) or `infi.verifyWebhook(...)` |
| Deliver the file | **1** | `infi.products.deliverable.get(productId).url` |

Compare to the CRM's original **4/painful** "who is the current user?" — the whole billing
surface is now first-class. `billing-as-code` (`sync`) especially: the entire product/price/
deliverable setup is one declarative call that's safe to re-run.

## Findings — status

1. **✅ FIXED — webhook typing + a real bug.** `verifyWebhook` was reading `type` from the
   body, but the type is **header-only** (`X-Webhook-Event-Type`), and there is **no
   `invoice.paid` event** (the route listened for one that never fires). Now: `verifyWebhook`
   takes `eventType` from the header, ships a typed event union of the **actually-emitted**
   events (`payment.confirmed`, `invoice.finalized/sent/voided/uncollectible`, `payment.failed`,
   `customer.created`) with payload interfaces. Route switched to `payment.confirmed`.
2. **✅ FIXED (SDK/backend) — checkout return URLs.** `checkout({ successUrl, cancelUrl })` →
   stored on the invoice (`success_url`/`cancel_url`, migration 000032) and returned on the
   checkout session. *Frontend redirect* (hosted pay page honoring `successUrl`) is the one
   remaining piece, in the `frontend` repo. Ebook keeps poll-based `/thanks` (its `checkout`
   call can't know the invoice id before creating it — a mild ordering wrinkle, not a blocker).
3. **✅ FIXED — product-linked purchase invoice.** `checkout()` now has two shapes: ad-hoc
   (`payerId` + lines) and **purchase** (`productId` + `customer`). The purchase path enrolls the
   customer (creates if new) and opens an invoice bound to the **enrollment** (`customer_id`), so
   the backend's `ResolveDeliverableForInvoice` matches and **the auto-email + download grant fire
   on `payment.confirmed`**. Price is auto-derived from the product's published base price. Backend:
   `POST /billing/products/{id}/invoices` (enroll → finalized enrollment invoice); SDK:
   `infi.invoices.createForProduct` + the `checkout` overload. The ebook now uses this.
   *Minor:* the purchase path doesn't emit `customer.created` (enroll upsert is silent there);
   in-app **file**-kind download still wants an authenticated `GET /billing/invoices/{id}/deliverable`
   (link kind works via `deliverable.get`).
4. **✅ FIXED (hardening) — per-example Prisma client.** Both examples now generate into
   `src/generated/prisma` (no shared-client clobber).
5. `payBaseUrl` must be set for local dev — documented; a dev preset would remove the footgun.

## Non-SDK finding (monorepo tooling)

Two examples generating the default `@prisma/client` **clobber each other** (last `prisma
generate` wins). Fixed by giving this example its own `generator output = src/generated/prisma`.
Worth standardizing across examples.

Net: the SDK expansion did its job — this example is ~90% app glue, ~10% Infi calls.
