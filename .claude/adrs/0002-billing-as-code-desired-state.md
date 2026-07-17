# ADR 0002 — Billing as code: desired-state sync (catalog + platform config)

**Status:** Accepted (2026-07)

## Context

`@beinfi/sdk` already ships a `defineBilling()` config + `infi.sync()` + `infi sync`
CLI (see [billing-as-code.ts]). Today it is a **seeder**: it creates missing
products, meters, versions, prices, and link-deliverables, matched idempotently by
natural `key`. It never touches what already exists — a metadata change is a no-op,
a price change is ignored (the first published version wins forever), and only the
catalog is covered.

We want to go further: declare **as much of a tenant's platform config as is safe**
in one versioned file and `infi sync` it — the same way we already version products
in software. The premise (git-versioned, reproducible tenant setup, CI-seedable,
"Terraform for billing") is sound. The risk is that billing is money: a careless
reconcile could reprice live customers or delete entities that historical invoices
and subscriptions still reference.

## Decision

Evolve `sync` from **seed-only** to **desired-state reconcile** for the catalog and
platform config, bounded by one rule:

> **Declarative = catalog + platform config. Runtime = per-customer state and money
> movement.**

**In scope (declarative, reconciled):**
- Products — create, **update metadata**, and **version-bump on price/pricing
  change** (create a new draft version, add its prices, publish; the old version
  stays immutable so existing subscriptions keep their pinned pricing).
- Meters, prices, link-deliverables (as today).
- **Identity apps** — slug (natural key), name, CORS origins, redirect URIs,
  session mode. create + update.
- **Webhook endpoints** — URL (natural key) + subscribed events. create + patch.
  Secrets are never rotated by sync (create-only secret; drift in events → patch).

**Out of scope (runtime only, never in config):** customers, credit grants,
invoices, subscriptions — transactional, per-customer.

**Safety invariants:**
- **Never delete.** A product/price/app/webhook removed from the config is reported
  as drift, not destroyed. Deprecation is explicit and manual (historical invoices
  and subscriptions may reference it).
- **Never mutate a published version.** Price changes always create a new version.
- **Plan-gated.** `infi sync --plan` shows create / update / version-bump / drift
  before apply; CI applies only after approval.
- **Drift-guarded (config versioning).** A lockfile (`infi.billing.lock.json`,
  committed next to the config) records a fingerprint of each product's backend
  state after every sync. The next sync measures drift as *backend-now vs
  backend-at-last-sync*: if a product changed in the dashboard since the lock, an
  `update`/`bump` is **blocked** (not silently overwritten) and reported as drift.
  `--force` overrides; `infi pull` regenerates the config + lock from the backend to
  adopt dashboard changes. This closes the two-sources-of-truth gap without any
  backend change (client-side provenance). Covers products, apps, and webhooks.

## Consequences

- `sync` gains a diff engine: compare config's desired prices/metadata against the
  current published version and report `update` / `version-bump`, not just
  `create` / `skip`. `SyncAction.action` grows `"update" | "bump"`.
- The config schema grows `apps` and `webhooks` sections alongside `products`.
- Reproducible, git-versioned tenant setup for our own examples and for integrators;
  fits the existing immutable-version model like git history.
- Deletion stays a human decision — safe default, at the cost of manual cleanup.

## Default rate-cards — dropped (non-goal)

Considered and rejected. Rate resolution is `per-customer rate_card > published
version price`, so the version price already IS the default for every customer. A
tenant-level "default rate-card" is therefore either redundant with the version
price, or means "a template copied into each customer at enrollment" — a rating +
enrollment model change with no concrete demand. Rate-cards stay **runtime and
per-customer** (`infi.customers.rateCards.set(...)`, as the marketplace already
does). If a real "every new customer is priced differently from the catalog" case
appears, revisit with its own ADR (the enrollment-template model).

## Phasing

- **P1 — the core (DONE):** products `update` + `version-bump` diff engine; richer
  `--plan` output. Implemented in `billing-as-code.ts` (`SyncAction` gains
  `update`/`bump` + `detail`). This is what makes it "billing as code" rather than a
  seeder.
- **P2 — platform config (DONE):** `apps` and `webhooks` sections in
  `defineBilling()` + reconcile (create + update, never delete/rotate). Matched by
  slug / url. Drift-guarded via the lock (`apps`/`webhooks` fingerprints) exactly
  like products — a dashboard edit blocks an update unless `--force`. `infi pull`
  emits them too.
- **P3 — meter update (DONE):** backend `PATCH /metering/products/{id}/meters/{meterId}`
  + `infi.products.meters.update` + sync now updates a meter's displayName/unit/
  aggregation when it drifts (the `name` slug stays immutable).
- **P3 — default rate-cards: dropped** (see "Default rate-cards — dropped" above).
  Rate-cards stay runtime and per-customer.

## Alternatives considered

- **Stay seed-only.** Rejected: does not deliver the versioned-config vision; price
  changes silently ignored.
- **Full reconcile with deletion (Terraform-complete).** Rejected: deleting billing
  entities with live history is dangerous; the value/risk ratio is bad. Deprecate,
  never delete.
- **YAML/JSON config.** Rejected: the value is a typed, autocompleted TS module
  (`defineBilling`); portability doesn't outweigh losing types.

## Non-goals

Destroying drift, in-place version edits, per-customer runtime state in config,
default/template rate-cards (dropped — rate-cards stay runtime and per-customer),
multi-currency FX, dunning/retry config.

[billing-as-code.ts]: ../../packages/sdk/src/billing-as-code.ts
