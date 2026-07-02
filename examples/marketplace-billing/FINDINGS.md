# Per-org usage billing — DX report

Fourth example, and the one that stresses the whole billing spine: catalog + **per-org rate-cards**
+ metering + **subscription period invoicing** + rating. Business: bill each org by usage at prices
that differ per organization. Same lens: dev-first / agentic-first.

## Verdict: **9 / 10** — one gap (subscription create), then it flowed

The backend already does the hard part (rate-card resolution + a full rating engine). The SDK
surfaced almost all of it; the single missing primitive was creating a subscription. We shipped it.

| Step | Effort (1 trivial → 5 painful) | Notes |
| --- | --- | --- |
| Seed product + 3 meters + prices | 1 | `infi.sync(defineBilling(...))`, publishes the version. |
| Per-org pricing (rate-cards) | 1 | `infi.customers.rateCards.set(enrollmentId, { meterId, model, unitAmount })` per meter. The headline feature, one call. |
| Create subscription | 1 (**after fix**) | `infi.products.subscribe(productId, { enrollmentId, anchor })`. Did not exist. |
| Ingest usage | 1 | `infi.trackBatch([...])`. |
| Usage dashboard | 1 | `infi.usage.get({ customerId: enrollmentId, from, to })` returns per-meter totals **already rated** (`totalAmount`), so projection is free. |
| Period invoice | 1 | `infi.invoices.generateFromSubscription(id)` → `send(id)`. |

## Findings

1. **✅ FIXED — no way to create a subscription in the SDK.** The SDK had
   `invoices.generateFromSubscription(id)` but nothing to *get* an `id` — subscription create
   (`POST /billing/products/{id}/subscriptions`) was unwrapped, so period invoicing was
   unreachable from the SDK. Added `infi.subscriptions.create/get/listForCustomer` +
   `infi.products.subscribe` alias. Everything else (backend + OpenAPI) already existed; this was
   the only true gap.

2. **⚠️ Period invoicing needs an ENDED period — non-obvious for a demo / first run.** Generation
   only bills a period whose `periodEnd < now` (else `ErrPeriodNotEnded`), and a fresh monthly
   subscription's period ends a month out. There is no "close period now" / "trigger billing"
   endpoint (a worker cron bills due subscriptions in production). The workaround — create the
   subscription with a **backdated `anchor`** so the first period is already closed — works and the
   `anchor` field is exposed, but an integrator will not guess it. **Fix candidates:** an explicit
   `invoices.generateFromSubscription({ force: true })` for sandboxes, or document the backdated-anchor
   recipe prominently. We chose the anchor (zero backend change).

3. **⚠️ Two ids, easy to swap.** Metering (`track`/`trackBatch`) keys on the customer's **external
   id** (a string you choose); rate-cards, usage, subscriptions and invoicing all key on the
   **enrollment id** (`ProductCustomer.id`, returned by `enroll`). Sending usage with the enrollment
   id, or setting a rate-card with the external id, fails quietly-ish. **Fix:** name the params
   unambiguously in docs/types (we called it `enrollmentId` in the subscribe input) and consider a
   helper that resolves external → enrollment.

4. **Nice:** `usage.get` returns `totalAmount` per meter, server-rated with the rate-card applied —
   the dashboard shows projected cost with **no client-side rating**. That removed the need for a
   separate rating dry-run/preview for this example (still worth having for pre-usage quotes).

## Follow-up (fixed after first pass)

- **Recurring usage = `pricingModel:"subscription"`, not `"usage"`.** The first seed used
  `pricingModel:"usage"` + `billingCycle:"monthly"`, which the backend rejects (`cycleRule`:
  a cycle is forbidden on `usage`/`one_time`; only `subscription`/`prepaid` carry one). `"usage"`
  means cycle-less ad-hoc billing. The cycle IS the subscription — fixed the seed to
  `subscription` with meters. Worth surfacing in docs: "recurring usage → subscription product".
- **The cycle is now more capable (backend):** each cycle **auto-notifies** the customer by email
  (no manual `send`), and a **prepaid** product can grant `creditsPerCycle` credits each period
  (advance billing). Same cycle engine, resolved by pricing model — see the ai-chat example for the
  credits variant. `@beinfi/sdk` `defineBilling` now takes `creditsPerCycle`.

## What was easy (keep)
- `sync` (publishes a version so the subscription binds cleanly), `rateCards.set`, `trackBatch`,
  `usage.get`, `generateFromSubscription`/`send` — all one-liners.
- Rate-card resolution + rating are entirely server-side: set different `unitAmount`s per org, send
  equal volume, and the invoices differ by exactly the price delta. No app-side money math.
- Types generated from OpenAPI matched the backend with zero guessing (incl. the new `Subscription`
  / `SubscriptionPeriod`).
