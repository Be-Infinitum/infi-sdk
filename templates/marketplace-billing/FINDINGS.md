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

## Metered-LLM surface adoption (DevEx)

Adopted the 0.9.0 metered surface into this **postpaid, per-org rate-card** example:
wrapped an inventory ingest route in `withMeter` and dropped `UsagePanel` (over
`infi.customers.state`) into the per-org dashboard cards. The surface installed cleanly
(typecheck passes), but it is visibly designed for **prepaid credits**, and this example
is the opposite billing model — most of the friction is that mismatch.

| Step | Effort (1 trivial → 5 painful) | Notes |
| --- | --- | --- |
| Wrap ingest route in `withMeter` | 2 | One wrapper, but had to reason about the credit-gate mismatch (`skipGuard`) and where the customer id comes from (header, not body). |
| Meter the event count | 1 | `extract: (r) => r.applied` reads the count off the handler result. Clean. |
| Resolve the org id | 2 | Body is consumed by the handler, so the id has to ride a header (`x-org-id`); `resolveCustomerId` can't read the body without stealing it from the handler. |
| Fetch state (`customers.state`) | 1 | One call, typed `CustomerState`. |
| Drop in `UsagePanel` | 1 | Presentational, renders in the server component, one prop. |
| Make the panel show the *right* numbers | 4 | It shows credit balance (empty here) and **current-period** usage (empty here — usage is in a backdated period), and does not surface the rate-card rated amount. Ends up misleading for this model without the existing custom table. |

### Frictions (numbered, with one-liner fixes)

1. **`withMeter` is credit-gate-FIRST; this model is postpaid.** The wrapper's headline
   behavior (402 out of credit *before* the handler runs) assumes a prepaid wallet.
   Per-org rate-card usage has no balance to draw down, so the gate is wrong and
   `skipGuard: true` is mandatory to avoid blocking/402-ing legitimate ingest. **Fix:**
   document a postpaid recipe front-and-center (or a `mode: "record" | "gate"` /
   `metered()` sibling) so `skipGuard` isn't a footgun the integrator only finds by
   reading option tables.
2. **Single-read body vs. `resolveCustomerId`.** `resolveCustomerId(req)` and
   `handler(req)` share one request; the body streams once. Resolving the customer from
   the JSON payload silently starves the handler (or vice-versa). Forced the id onto a
   header. **Fix:** pass a pre-parsed/cloned body (or a `context`) to `resolveCustomerId`,
   or document "resolve id from headers/query, never the body."
3. **`customers.state` has no period selector — always current period.** `UsagePanel`
   renders `state.usage`, which is the *live* period. This demo (and any backdated /
   historical view) needs an explicit `from`/`to`; the panel can't show it. `usage.get`
   already takes a range — `state`/`UsagePanel` don't. **Fix:** accept an optional
   `{ from, to }` on `customers.state` (or a `period` prop on `UsagePanel`).
4. **`UsagePanel` doesn't surface rated cost per the rate-card.** From the public
   surface it renders balance + per-meter usage + subscriptions; the rate-card
   `unitAmount` / `totalAmount` (the whole point of per-org pricing) isn't shown, so the
   hand-rolled table stays the source of truth. **Fix:** render `MeterUsage.totalAmount`
   (server-rated, already in `UsageReport`) with a currency label in the panel.
5. **Credit-centric labeling on a no-credit model.** `creditLabel` + a balance row imply
   a wallet; here it's dead UI (balance empty). **Fix:** a `hideCredit` prop (mirror of
   `hideSubscriptions`) so postpaid dashboards can drop the wallet section cleanly.
6. **Multi-org fit is fine.** One `state` fetch + one `<UsagePanel/>` per org card
   composes without issue; no shared/singleton assumptions. (Positive.)

### Resolved

The 0.9.0 surface was reworked and this example re-adopted the clean path — the
workarounds above are gone:

- **#1 (gate-first mismatch)** fixed by `mode: "postpaid"` on `withMeter`. The route
  now declares intent (record, never gate) instead of negating the gate via
  `skipGuard: true`; the pre-flight 402 is skipped by design, not by footgun.
- **#3 (no period on `state`)** fixed by `customers.state(id, { from, to })`. The
  dashboard passes the demo's backdated window, so `UsagePanel` renders the real
  per-meter usage instead of a zeroed live period.
- **#4 / #5 (rated amount / dead credit UI)** fixed by the period fix plus
  `hideCredit`. With the right window `UsagePanel` shows each meter's server-rated
  `totalAmount` (the per-org rate-card cost), and `hideCredit` drops the empty wallet
  row this postpaid model never uses.
