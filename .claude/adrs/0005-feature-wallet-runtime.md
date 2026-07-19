# ADR 0005 — Feature wallet runtime (generic debit/credit)

**Status:** Proposed (2026-07)

## Context

Today prepaid billing is modeled as a **single credit wallet**
(`credits.grant` / `credits.consume` / `credits.balance`) plus meters for usage.
A nice-to-have “auto-grant credits on `payment.confirmed`” was deferred because it
races with subscription `credits_per_cycle` / `credit_grant` (double grant risk)
and couples fulfillment to the word “credit”.

Product feedback: apps want something closer to

```ts
await wallet.debit("featureA", "1");
await wallet.credit("tokens", "50000");
```

i.e. **named feature balances**, not only a generic credit pool. The billing plan
declares which features a payment/cycle grants; the backend is a ledger runtime;
the SDK is the ergonomic surface.

## Decision

### 1. Backend = feature ledger runtime

- Each enrollment has zero or more **feature balances** keyed by string
  (`"tokens"`, `"seats"`, `"exports"`, `"featureA"`, …).
- Primitive ops (idempotent when a key is supplied):

  | Op | Meaning |
  |----|---------|
  | `credit(feature, amount, { reason, idempotencyKey })` | Increase balance |
  | `debit(feature, amount, { reason, idempotencyKey })` | Decrease; reject if insufficient |
  | `balance(feature?)` | One feature or all |

- Legacy `credits.*` is the special case `feature = "credits"` (or product default
  meter / `credits` alias) — keep the old routes as shims so existing prepaid
  products keep working.

### 2. Plan grants features (not “auto credit”)

Company-as-code / product version declares **grants**, not a parallel
`onPayment.grantCredits` flag:

```ts
defineCompany({
  products: [{
    key: "ai-chat",
    pricingModel: "prepaid",
    billingCycle: "monthly",
    basePrice: "19.90",
    // cycle grant (replaces credits_per_cycle as the generic form)
    grants: [{ feature: "tokens", amount: "50000", on: "cycle" }],
  }, {
    key: "token-pack",
    pricingModel: "one_time",
    basePrice: "9.90",
    grants: [{ feature: "tokens", amount: "100000", on: "payment" }],
  }],
});
```

| `on` | When the runtime credits |
|------|--------------------------|
| `cycle` | Subscription period open / renew (today’s `credits_per_cycle`) |
| `payment` | `payment.confirmed` for that product’s invoice (packs / one-time) |

**Mutual exclusion:** a single grant line has one `on`. A prepaid plan uses
`on: "cycle"`. A pack uses `on: "payment"`. Never both for the same
product+feature on the same payment path. Idempotency key =
`payment_id` or `subscription_id + period_start` + `feature`.

### 3. SDK operationalizes

Ergonomics (target API — not all shipped yet):

```ts
const wallet = await infi.wallet.fromSession(token, { productKey: "ai-chat" });

await wallet.debit("tokens", "120");           // gate a call
await wallet.credit("exports", "10");          // admin / promo
const { balance } = await wallet.balance("tokens");

// optional sugar for the default feature of the product
await wallet.debit(amount); // → product.defaultFeature ?? "credits"
```

`infi.meter({ mode: "prepaid" })` becomes: resolve feature from meter/product →
`debit` (or soft-check) → run fn → optionally `track` usage for invoicing.

### 4. What this replaces

- §5 “credit pack auto-grant” in the sandbox backend prompt: **do not** add a
  credit-only `onPayment.grantCredits` shortcut.
- Prefer implementing **grants[] on product version** + generic ledger. Until
  then, apps keep using webhooks + `credits.grant`.

## Consequences

- Sandbox P0 (allowlist lax, claim intent, go-live) stays unchanged.
- OpenAPI grows feature-ledger routes (or generalizes `/credit` → `/wallet/{feature}`).
- SDK `Wallet` type gains `debit` / `credit` / `balance` methods bound to
  `enrollmentId`.
- Docs teach “features on the plan”, not “remember to grant credits in a webhook”.

## Non-goals (this ADR)

- Entitlement booleans without quantity (`hasFeature("sso")`) — can be
  `balance >= 1` or a later flag type.
- Changing live KYC / payment rails.
