# ADR 0005 — Meter wallet runtime (generic debit/credit)

**Status:** Accepted (SDK client shipped; backend pending — see `specs/backend-meter-wallet-prompt.md`)

## Context

Today prepaid billing is a **single credit wallet**
(`credits.grant` / `credits.consume` / `credits.balance`) plus **meters** for
usage. A credit-only “auto-grant on `payment.confirmed`” was deferred (races
`credits_per_cycle` / `credit_grant`).

Desired app ergonomics:

```ts
await wallet.debit("tokens", "120");
// or
await wallet.debit({ meter: "tokens", amount: "120" });
```

Earlier drafts called the key a “feature”. That invents a third concept — the
catalog already has **meters** (1:1 with what you charge/consume). Keep that
vocabulary.

| Name | Fit |
|------|-----|
| **meter** | Already exists; 1:1 with charge/consume |
| unit / balance key | Neutral internal API name if needed |
| resource | tokens / exports / seats (informal) |
| allowance | Only if prepaid quota |
| feature / sku dimension | Avoid — new or heavy |

## Decision

### 1. Backend = meter ledger runtime

- Each enrollment has balances keyed by **meter key** (`"tokens"`, `"exports"`,
  `"seats"`, …) — same keys as product meters in company-as-code.
- Primitive ops (idempotent when a key is supplied):

  | Op | Meaning |
  |----|---------|
  | `credit(meter, amount, { reason, idempotencyKey })` | Increase balance |
  | `debit(meter, amount, { reason, idempotencyKey })` | Decrease; reject if insufficient |
  | `balance(meter?)` | One meter or all |

- Internal/OpenAPI may say `balanceKey` if useful; public SDK and company config
  say **`meter`**.
- Legacy `credits.*` shims to a default meter (product prepaid meter or
  `"credits"`) so existing prepaid products keep working.

### 2. Plan grants meters (not “auto credit”)

```ts
defineCompany({
  products: [{
    key: "ai-chat",
    pricingModel: "prepaid",
    billingCycle: "monthly",
    basePrice: "19.90",
    meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
    grants: [{ meter: "tokens", amount: "50000", on: "cycle" }],
  }, {
    key: "token-pack",
    pricingModel: "one_time",
    basePrice: "9.90",
    meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
    grants: [{ meter: "tokens", amount: "100000", on: "payment" }],
  }],
});
```

| `on` | When the runtime credits |
|------|--------------------------|
| `cycle` | Subscription period open / renew (today’s `credits_per_cycle`) |
| `payment` | `payment.confirmed` for that product’s invoice (packs / one-time) |

**Mutual exclusion:** one `on` per grant line. Never `cycle` + `payment` for the
same product+meter on the same path. Idempotency:
`payment_id` or `subscription_id + period_start` + `meter`.

### 3. SDK operationalizes

```ts
const wallet = await infi.wallet.fromSession(token, { productKey: "ai-chat" });

await wallet.debit("tokens", "120");
await wallet.debit({ meter: "tokens", amount: "120" });
await wallet.credit({ meter: "exports", amount: "10" });
await wallet.balance("tokens");
```

Note: `infi.meter(opts, fn)` stays the **usage helper** (gate + track). Here
`meter` is the **noun** (catalog key). No rename of the helper.

`infi.meter({ mode: "prepaid", meter: "tokens" })` → resolve wallet → `debit`
that meter → run fn → optionally `track`.

### 4. What this replaces

- Do **not** add credit-only `onPayment.grantCredits`.
- Prefer `grants[]` on product version + meter ledger. Until then: webhooks +
  `credits.grant`.

## Consequences

- Sandbox P0 unchanged.
- OpenAPI: generalize credit routes toward wallet-by-meter (or keep `/credit` as
  default-meter shim).
- SDK `Wallet` gains `debit` / `credit` / `balance` bound to `enrollmentId`.
- Docs: “grant meters on the plan”, not a separate feature concept.

## Non-goals

- Boolean entitlements without quantity — later (`balance >= 1` or flags).
- Live KYC / payment rails.
