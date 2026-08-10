# Skill — add prepaid AI chat billing

**When:** User wants token-based AI chat with prepaid credits, credit packs, and usage display.

## Steps

1. Add dependencies: `@beinfi/sdk`, `ai`, `@ai-sdk/anthropic`.
2. Create `infi.billing.ts`:

```ts
import { defineBilling } from "@beinfi/sdk";

export default defineBilling({
  products: [{
    key: "ai-chat",
    type: "agent",
    pricingModel: "prepaid",
    billingCycle: "monthly",
    currency: "BRL",
    basePrice: "19.90",
    meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
    prices: [{ meter: "tokens", model: "prepaid_credits", unitAmount: "0.01" }],
  }],
});
```

3. `infi sync infi.billing.ts && infi doctor`
4. Resolve the payer from **your own** auth — Beinfi does not do login:

```ts
const wallet = await infi.wallet.forCustomer(myUserId, { productKey: "ai-chat" });
```

5. Chat route — **streaming meter**:

```ts
await infi.meter({ customerId: enrollmentId, meter: "tokens", mode: "streaming" }, () =>
  streamText({ onFinish: ({ usage }) => infi.customers.credits.consume(enrollmentId, { amount: String(usage.totalTokens ?? 0) }) })
);
```

6. Webhook `payment.confirmed` → `credits.grant` for credit packs.

## Gotchas

- Gate with `mode: "streaming"` — do not use default meter with `streamText`
- `wallet.forCustomer(externalId, …)` enrolls on first call and returns the wallet
