---
name: usage-based-subscription
description: Bill a subscription plus metered usage — API calls, seats, ingestion — with optional per-customer rate cards. Use for usage-based SaaS pricing on a recurring cycle.
---

# Usage-based subscription with Infi

A recurring fee plus what they used, invoiced per cycle.

## 1. Catalog

```bash
npx -y @beinfi/cli bootstrap --intent usage-saas --ref cli --json
```

Or declare it:

```ts
// infi.company.ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany({
  products: [{
    key: "integration",
    name: "Integration",
    type: "agent",
    pricingModel: "subscription",
    billingCycle: "monthly",
    currency: "BRL",
    basePrice: "99.00",
    meters: [{ key: "api_calls", unit: "request", aggregation: "sum" }],
    prices: [{ meter: "api_calls", model: "per_unit", unitAmount: "0.01" }],
  }],
  webhooks: [{
    url: "https://seuapp.com/api/webhooks/infi",
    events: ["payment.confirmed", "invoice.sent"],
  }],
});
```

```bash
npx -y @beinfi/cli sync infi.company.ts && npx -y @beinfi/cli doctor
```

Pricing is immutable once published: an edit creates a new version, so a price
change never rewrites a past bill. `sync` handles the bump.

## 2. Enroll and subscribe

```ts
const enrollment = await infi.products.enroll(productId, { externalId: orgId, email });
await infi.products.subscribe(productId, { customerId: enrollment.id });
```

Use `enrollment.id`, never `enrollment.customerId` — the second is the
tenant-level customer, and usage calls reject it with `422 unknown customer`.
This is the single most common wrong turn in this flow.

## 3. Track usage

```ts
await infi.track({
  customerId: enrollment.id,
  meter: "api_calls",
  value: "1",
  eventId: requestId,          // your own idempotency key
  timestamp: whenItHappened,   // pin it to the EVENT, not the call
});
```

Batch on the hot path: `infi.session(enrollmentId).track("api_calls", 1).flush()`.

**`eventId` alone does not deduplicate.** The dedupe key includes the timestamp,
so the same `eventId` sent twice with no `timestamp` is stored twice and billed
twice. Any retry path must send both, fixed to the event.

## 4. Per-customer pricing

```ts
await infi.customers.rateCards.set(enrollment.id, { /* meter overrides */ });
```

Rate cards resolve on top of the published version — the enterprise-discount case
without a second product.

## 5. Invoicing

Subscriptions bill on cycle close. To bill a window on demand:

```ts
await infi.invoices.fromUsage({ customerId: enrollment.id, from, to, send: true });
```

Rejects with `422` when the window has no billable usage.

## Traps

- **`apps` is not a config key.** Product-level auth was removed; bring your own
  auth and pass your own user id.
- **Webhook registration answers `503` in sandbox** (no secret store for test
  tenants). Poll there; webhooks are a production path.
- **`billingCycle` is required** for `pricingModel: "subscription"` — without it,
  `422`.
