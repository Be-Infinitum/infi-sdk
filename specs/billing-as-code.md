# Spec — Billing as Code (idempotent tenant seed)

**Status:** Spec (planned). Cross-cutting; unblocks all example specs.
Target: `@beinfi/sdk` (a `sync` primitive) + optional `@beinfi/cli`.

## Goal

Declare a tenant's **products, versions, prices, meters, and per-customer rate-cards** in
a versioned config file and apply it **idempotently** — run it once or a hundred times,
same result. "Terraform for billing." Every example above currently needs a fragile
imperative setup script hitting a dozen `POST` endpoints; this replaces that with one
declarative source of truth that the examples (and real customers) seed from.

## Why now

The three example specs all start with the same painful step: "create product → version →
price → meter → publish → maybe rate-cards" via raw REST, non-idempotent (re-running
duplicates). This is the shared blocker. Solve it once.

## Shape

A config module the developer owns:

```ts
// infi.billing.ts
import { defineBilling } from "@beinfi/sdk";

export default defineBilling({
  products: [
    {
      key: "ai-chat",                    // stable natural key → idempotency
      name: "AI Chat",
      type: "agent",
      pricingModel: "prepaid",
      currency: "BRL",
      meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
      prices: [{ meter: "tokens", model: "per_unit", unitAmount: "0.002" }],
    },
    {
      key: "ebook-x",
      type: "item",
      pricingModel: "one_time",
      prices: [{ model: "flat", unitAmount: "49.00" }],
      deliverable: { kind: "file", path: "./ebook.pdf" },
    },
  ],
  // per-customer overrides can be declared or applied at runtime (marketplace)
});
```

Apply it:

```bash
bunx @beinfi/cli sync --key sk_test_...   # or infi.sync(config) in code
```

## Behavior

- **Idempotent by stable `key`** per entity (product key, meter key). Sync reads current
  tenant state, then: create missing, update changed metadata, no-op unchanged.
- **Immutable versions**: prices live on published (immutable) versions. When a price
  changes, sync **creates a new draft version + publishes it** rather than mutating — and
  reports the version bump. Never silently rewrites history.
- **Dry-run / plan**: `sync --plan` prints the diff (create/update/version-bump) before
  applying, like `terraform plan`.
- **Deliverables**: file deliverables uploaded + attached; re-upload only on content hash
  change.
- **Rate-cards**: optional declarative per-customer overrides, or leave to runtime
  (marketplace example sets them per org as orgs onboard).

## Backend gaps to resolve first (findings)

1. **Stable natural keys.** Products/meters are matched today by uuid or `name`. Idempotent
   sync needs a **unique per-tenant `key`/`externalId`** on product and meter (and ideally
   rate-card) so re-runs match instead of duplicating. **Likely a backend schema add.**
2. **Deliverable create/upload API.** The billing map found only the public download GET —
   confirm/expose a create+upload endpoint (blocks the ebook seed).
3. **Idempotency keys** on the create endpoints (or upsert semantics), so a retried sync is
   safe even before natural keys land.

## SDK gaps

- `defineBilling()` + `infi.sync(config, { plan?: boolean })`.
- Catalog methods (`products/versions/prices/meters`) the sync builds on — the same ones
  the marketplace/ebook specs want directly.
- A `@beinfi/cli` wrapper (`sync`, `plan`) for CI / one-shot seeding.

## Verification

Run `sync` twice → second run is a no-op (empty plan). Change a price → `plan` shows a
version bump; `sync` publishes a new version, old invoices unaffected. Each example's
`SPEC` setup step reduces to "import the shared `infi.billing.ts` and `sync`."

## Open questions

- Config format: TS module (typed, recommended) vs YAML/JSON (portable)?
- Does sync own deletion (destroy removed products) or only create/update (safer default)?
- One config per example, or a shared root config the examples extend?
