# Skill — add prepaid AI chat billing

**When:** User wants token-based AI chat with prepaid credits, credit packs, and usage display.

## Steps

1. Copy `templates/ai-chat` or add dependencies: `@beinfi/sdk`, `@beinfi/auth`, `ai`, `@ai-sdk/anthropic`.
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
  apps: [{
    slug: process.env.INFI_SLUG!,
    name: "AI Chat",
    allowedOrigins: [process.env.APP_URL!],
    redirectUris: [`${process.env.APP_URL}/callback`],
  }],
});
```

3. `infi sync infi.billing.ts && infi doctor`
4. Auth routes with `@beinfi/auth`:

```ts
app.get("/api/auth/login", (c) => c.redirect(createLoginHandler({...})(c.req.raw)));
// Prefer: mount handlers directly on fetch routes
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
- Enroll on first login: `products.enroll()` → wallet id
- See `examples/ai-chat/FINDINGS.md`
