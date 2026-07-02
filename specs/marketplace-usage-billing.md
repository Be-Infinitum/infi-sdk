# Spec — Example: Marketplace inventory integrator (per-org usage billing)

**Status:** Implemented (`examples/marketplace-billing/`, Next.js + Prisma, `@beinfi/sdk@0.7.0`).
Added the one missing primitive it needed — subscription create (`infi.products.subscribe` /
`infi.subscriptions.*`) — everything else (rate-cards, usage.get, generateFromSubscription) was
already in the SDK. See the example's FINDINGS.md. Original spec below.

## Goal

Model a real business: a company that syncs inventory across marketplaces and bills its
customers **by usage, at prices that differ per organization**. The same event
(`inventory_update`) costs a different amount for Org A vs Org B. Other billed events:
`price_update`, `notification`. At period end, generate and send each customer an invoice.
Goal (as always): find what the SDK must add to make per-org usage billing painless.

This is the strongest case in the set for **billing-as-code** (see that spec) and for
expanding the SDK beyond `track`.

## Stack

- Next.js (App Router) + `@beinfi/nextjs` for the operator dashboard (reuse the CRM's
  `getSession` auth pattern). A worker/script simulates inventory/price/notification
  events flowing in.

## Domain / billing model

- **Meters** on one product `integration`: `inventory_update`, `price_update`,
  `notification` (aggregation `sum`).
- **Base plan price** per meter (the default rate).
- **Per-org override = rate-card**: Org A and Org B get different `unitAmount` for
  `inventory_update` via a customer rate-card. This is the crux.
- **Period close** → subscription invoice aggregates each meter's usage, the rating engine
  applies the resolved price (rate-card wins over plan price), producing invoice line items.

## Infi integration — capability vs today

| Need | Backend | SDK today |
| --- | --- | --- |
| Define product + meters | `POST /metering/products`, `.../meters` | ❌ not in SDK |
| Base prices per meter | `POST .../versions/{id}/prices` + publish | ❌ not in SDK |
| **Per-org price** | `POST /metering/customers/{id}/rate-cards` (RateCard, all models) | ❌ **gap** — the headline feature, not in SDK |
| Ingest events | `POST /metering/events[/batch]` | ✅ `infi.track` / `trackBatch` |
| Query usage | `GET /metering/usage` | ❌ not in SDK |
| Generate period invoice | `POST /billing/subscriptions/{id}/invoices` | ❌ not in SDK |
| Send invoice (email) | `POST /billing/invoices/{id}/send` (fires `invoice.sent`) | ❌ not in SDK |
| Rating (usage → money) | `internal/rating` (flat/per_unit/tiered/volume/package/prepaid) | n/a (server) |

Backend **fully supports** this end to end (rate-cards + rating + subscription invoicing).
The entire gap is that the **SDK exposes none of the catalog/pricing/invoice surface** —
today you'd call raw REST. That's the finding.

## Key flows

1. **Seed** (billing-as-code): product `integration` + 3 meters + base prices, published.
2. **Onboard org** → create customer; set **rate-cards** overriding `inventory_update`
   (and others) per org.
3. **Ingest** → integration events call `trackBatch([{meter, customerId, value}...])`.
4. **Dashboard** → per-org usage totals (`GET /metering/usage`) and projected cost.
5. **Period close** → generate subscription invoice per customer → review line items
   (usage rated at that org's rate-card) → `send` → `invoice.sent`/`invoice.paid` webhooks.

## SDK gaps to fix (findings)

1. **`infi.customers.rateCards.set(customerId, {...})`** — per-customer pricing is the
   whole reason this business is hard; it must be a first-class SDK call.
2. **Catalog in the SDK**: `infi.products.create`, `versions`, `prices`, `meters` — or,
   better, the billing-as-code sync (see other spec) so pricing is declarative.
3. **`infi.usage.get({customerId, from, to})`** for dashboards.
4. **Invoices in the SDK**: `infi.invoices.generate(subscriptionId)` / `.send(id)` / `.list`.
5. **A rating preview / dry-run** (`infi.rate(customerId, usage)`) so the app can *show*
   projected cost before the invoice closes — the customers' #1 anxiety.

## Verification

Two orgs, different rate-cards, same event volume → invoices differ by exactly the
rate-card delta. Confirm the rating matches a hand calc. Log every raw REST call the SDK
should have owned.

## Open questions

- Subscriptions per customer, or usage-only ad-hoc invoices per period?
- Are `notification`/`price_update` always plan-priced, or also org-overridable?
- Minimums/commitments per org (backend has commitment) — in scope?
