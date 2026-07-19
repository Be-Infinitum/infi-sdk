# Task: Meter wallet runtime (ADR 0005)

Implement a **generic meter ledger** so apps can `wallet.debit("tokens", "120")` and plans declare `grants[]` — without inventing a “feature” concept or a credit-only `onPayment.grantCredits` shortcut.

SDK already ships the client surface (shimmed to today’s single credit wallet). Make the API the real runtime.

See: `infi-sdk` ADR 0005 (`.claude/adrs/0005-meter-wallet-runtime.md`).

---

## Goal

| Layer | Responsibility |
|-------|----------------|
| **Backend** | Ledger keyed by `(enrollment_id, meter_key)` + apply plan `grants` |
| **Company as code** | `grants: [{ meter, amount, on: "cycle" \| "payment" }]` |
| **SDK** | `wallet.debit` / `credit` / `balance` (already stubbed on `credits.*`) |

---

## 1) Per-meter ledger API

Generalize today’s single wallet (`/metering/customers/{enrollmentID}/credit`).

### Suggested routes (names flexible)

```
GET    /metering/customers/{enrollmentID}/wallet              → all meter balances
GET    /metering/customers/{enrollmentID}/wallet/{meter}      → one balance + entries
POST   /metering/customers/{enrollmentID}/wallet/{meter}/credit
POST   /metering/customers/{enrollmentID}/wallet/{meter}/debit   # aka consume
```

Body (credit/debit):

```json
{ "amount": "120", "reference": "optional", "idempotencyKey via header": true }
```

Rules:

- `meter` = catalog meter **name/key** on the product (same as `track` / company `meters[].key`).
- Debit rejects **409** if insufficient (same as consume today).
- Idempotency-Key required for safe retries (especially payment grants).
- Legacy `/credit` + `/credit/consume` remain as shims → default prepaid meter of the enrollment’s product (or `"credits"`).

OpenAPI + tests: multi-meter isolation (debit tokens ≠ debit exports).

---

## 2) Persist `grants[]` on product version

Extend version create/read (and OpenAPI):

```json
{
  "billingCycle": "monthly",
  "basePrice": "19.90",
  "creditsPerCycle": "50000",
  "grants": [
    { "meter": "tokens", "amount": "50000", "on": "cycle" },
    { "meter": "tokens", "amount": "100000", "on": "payment" }
  ]
}
```

Migration:

- `creditsPerCycle` stays; treat as alias of a single `grants[{ on: "cycle", meter: <default prepaid meter> }]`.
- When both present, prefer `grants` (or reject if they disagree — pick one and document).

Validation:

- `grants[].meter` must exist on the product.
- At most one of `cycle` / `payment` semantics per product+meter on the same fulfillment path (no double grant).

---

## 3) Apply grants (the money path)

| `on` | Trigger | Idempotency key |
|------|---------|-----------------|
| `cycle` | Subscription period open / renew (replace bare `credits_per_cycle` credit_grant) | `sub:{id}:period:{start}:meter:{m}` |
| `payment` | `payment.confirmed` for an invoice tied to that product | `payment:{id}:meter:{m}` |

Hard rules:

1. **Never** credit the same payment twice (webhook retries).
2. Prepaid plan → `on: "cycle"` only for that meter. Pack / `one_time` → `on: "payment"`.
3. If invoice/subscription items already include a `credit_grant` line that covers the same meter+amount, do not also apply a grant row (or migrate items to grants and drop the duplicate path — one writer).
4. Target wallet = **enrollment** on the invoice/subscription.

---

## 4) Out of scope / do not do

- Do **not** add `onPayment.grantCredits` as a product flag.
- Do **not** invent a `feature` key — use **meter**.
- Sandbox P0 (lax allowlist, claim intent, go-live) can ship **without** this.

---

## 5) Success criteria

1. Two meters on one enrollment have independent balances.
2. Paying a `one_time` pack with `grants: [{ meter: "tokens", amount: "100000", on: "payment" }]` credits the wallet once; replay of `payment.confirmed` no-ops.
3. Prepaid renew with `on: "cycle"` credits once per period.
4. Legacy `credits.grant` / `consume` still work (shim).
5. OpenAPI updated; tests green.

---

## SDK already done (for reference)

```ts
const wallet = infi.wallet.bind(enrollmentId);
await wallet.debit("tokens", "120");
await wallet.credit({ meter: "tokens", amount: "50000", idempotencyKey: "…" });
await wallet.balance("tokens");

// company as code
grants: [{ meter: "tokens", amount: "50000", on: "cycle" }]
// sync maps cycle → creditsPerCycle until this backend ships
```
