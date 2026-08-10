# Skill — add usage-based SaaS billing

**When:** User bills per metered event (API calls, seats, ingestion) on a subscription cycle.

## Steps

1. `infi.billing.ts` with subscription + meters:

```ts
export default defineBilling({
  products: [{
    key: "integration",
    type: "agent",
    pricingModel: "subscription",
    billingCycle: "monthly",
    currency: "BRL",
    meters: [{ key: "api_calls", unit: "request", aggregation: "sum" }],
    prices: [{ meter: "api_calls", model: "per_unit", unitAmount: "0.01" }],
  }],
  apps: [{ slug: "...", name: "...", allowedOrigins: [...], redirectUris: [...] }],
});
```

2. `infi sync infi.billing.ts`
3. Track usage: `infi.track({ meter: "api_calls", value: "1", customerId: enrollmentId })`
4. Per-org pricing: `infi.customers.rateCards.set(enrollmentId, { ... })`

