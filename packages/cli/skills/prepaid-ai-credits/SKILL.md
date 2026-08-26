---
name: prepaid-ai-credits
description: Bill an AI feature by tokens against a prepaid credit balance, refusing work when the balance runs out. Use for AI chat, agents, or any per-token product where the user buys credit up front.
---

# Prepaid AI credits with Infi

The shape: the customer holds a balance of units, your AI route debits as it
streams, and an empty balance returns 402 instead of doing work for free.

## 1. Catalog

```bash
npx -y @beinfi/cli bootstrap --intent prepaid-ai-chat --ref cli --json
```

Or declare it:

```ts
// infi.company.ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany({
  products: [{
    key: "ai-chat",
    name: "AI Chat",
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

```bash
npx -y @beinfi/cli sync infi.company.ts && npx -y @beinfi/cli doctor
```

The file is `infi.company.ts` and the function is `defineCompany` — `bootstrap`,
`sync`, `pull` and `doctor` all assume that name. (`defineBilling` is the old
alias; same shape, do not use it in new code.)

## 2. Resolve the payer from YOUR auth

Infi does not do end-user login. Pass your own user id:

```ts
const wallet = await infi.wallet.forCustomer(myUserId, { productKey: "ai-chat" });
await wallet.balance("tokens");
```

`forCustomer` takes **your** `externalId` and handles enrollment for you. If you
go the long way instead, use `infi.products.enroll(productId, { externalId })` and
keep the returned `.id` — **not** `.customerId`. Usage and credit calls take the
enrollment id, and the customer id is rejected with `422 unknown customer`.
`customers.create` returns the wrong one for this purpose.

## 3. Gate, then meter

```ts
import { InsufficientCreditError } from "@beinfi/sdk";

try {
  const result = await infi.meter(
    { customerId: enrollmentId, meter: "tokens" },
    async (track) => {
      const stream = await streamText({ model, messages });
      for await (const chunk of stream.textStream) { /* … */ }
      track(stream.usage.totalTokens);        // debited after the work
      return stream;
    },
  );
} catch (err) {
  if (err instanceof InsufficientCreditError) {
    return Response.json({ error: "no_credit", checkout: buyMoreUrl }, { status: 402 });
  }
  throw err;
}
```

`infi.meter` checks the balance **before** running the callback, so an empty wallet
costs you nothing.

## 4. Selling more credit

A credit pack is a one-time purchase; `payment.confirmed` grants the units. See
the `sell-digital-product` skill for the checkout and thank-you page, and
`test-payment-in-sandbox` to confirm the payment in CI.

## Traps

- **Replayed usage bills twice.** `track`/`trackBatch` dedupe on `eventId` **and**
  `timestamp` together. The same `eventId` sent twice with no `timestamp` is stored
  twice and billed twice. Anything that replays (queue retry, cron, backfill) must
  pin both fields to the event, not to the call.
- **`creditsPerCycle` is gone.** Use `grants: [{ meter, amount, on: "cycle" }]`.
- The balance may go negative: the gate applies before the work, and the deficit at
  cycle close is the overage.
- **Refunding a credit pack does NOT remove the credits.** The money goes back and
  the balance stays spendable — the wallet has only grant and consume entries, and
  a refund writes neither. If you refund a top-up, debit the unconsumed remainder
  yourself. There is no obvious right answer when the buyer already spent 800 of
  1000, which is exactly why it is not automatic.
