# Changelog

## Unreleased

### Added
- Billing-as-code desired-state sync (ADR 0002, P1): `infi.sync()` now **updates**
  product metadata and **version-bumps** on price / base-price / credits / billing-cycle
  changes (a new version is published; prior versions stay immutable), instead of
  seed-only. `SyncAction.action` gains `"update"` and `"bump"` plus a `detail` reason;
  `infi sync --plan` prints them.
- Drift guard + config versioning: `SyncOptions` accepts a previous `lock` and
  `force`; `SyncResult` returns `{ drift, lock }`. When a product changed in the
  dashboard since the last sync, an update/bump is **blocked** unless `--force`. The
  CLI persists `infi.billing.lock.json`; `infi pull` regenerates config + lock from
  the backend. New exports: `buildLock`, `SyncLock`, `ProductLock`, `DriftEntry`. Never deletes, never mutates a published version.
- `infi.coupons.list/create/get/delete/updateStatus` — tenant-wide merchant
  discounts for subscription invoices (`/billing/coupons`).
- `pay.applyCoupon({ slug, invoiceId, code })` — apply a coupon at public checkout,
  returns the discounted invoice.
- `pay.downloadUrl(slug, token)` — build the public deliverable download URL.
- `Coupon` / `CreateCouponRequest` types.

### Changed
- Regenerated OpenAPI types from the backend contract (coupons, customer state,
  deliverable download, ServiceUnavailable). `CustomerState` now aliases the
  generated schema instead of a hand-written interface (drift removed).

### Removed
- `infi.sandbox.create/get` and the `SandboxRef` / `ClaimableSandbox*` /
  `CreateSandboxOptions` types. Sandbox provisioning is a dev-time concern and now
  lives in `@beinfi/cli` (`createSandbox`/`getSandbox`), re-exported from
  `@beinfi/cli/lib/provision`. See ADR 0001. No app runtime called this.

## 0.8.1

### Added
- `infi.sandbox.create({ ref })` — provision a claimable billing sandbox (public, no auth).
- `infi.sandbox.get(id)` — poll public sandbox claim status.
- `infi.apiKeys.list/create/revoke` — tenant API key management.
- `exchangeCliToken()` — exchange dashboard session for CLI API key (`POST /auth/cli/token`).

## 0.9.0

Metered-LLM surface: a credit gate + usage recording in one call, plus a one-read customer view.

### Added
- `infi.meter(options, fn)` — gate credit, run `fn`, record its usage. Token usage auto-detected
  from OpenAI (`usage.total_tokens`) / Anthropic (`input_tokens + output_tokens`) shapes; override
  with `value`/`extract`; `skipGuard` opts out of the gate. Records only on success; returns `fn`'s
  result unchanged.
- `InsufficientCreditError` (status `402`, code `insufficient_credit`, fields `customerId`,
  `balance`) — thrown by `meter` before `fn` runs when the balance is exhausted.
- `infi.customers.state(id)` → `CustomerState` → `GET /metering/customers/{id}/state` (enrollment,
  credit, subscriptions, current-period usage).
- `UsagePanel` React component (`@beinfi/sdk/react`) — presentational credit/usage/subscriptions
  panel over a `CustomerState`.
- Companion `withMeter(options, handler)` App Router route gate in `@beinfi/nextjs`.

## 0.2.0

**Breaking.** Realigned the SDK to the real backend identity flow (email codes)
and removed the stale magic-link design.

### Removed
- `sendMagicLink()` / `validateMagicLink()` / `validateMagicLinkFromRequest()` and
  the dead `POST /identity/magic-link` and `POST /identity/validate` calls.
- `publishableKey` config and `InfiLogin`'s `publishableKey` prop. Public
  email-code endpoints need no key.
- `SendMagicLinkOptions`, `ValidateMagicLinkOptions`, `MagicLinkMode` types.

### Added
- `sendEmailCode({ slug, email, redirectTo?, state? })` → `POST /identity/apps/{slug}/email-code`.
- `verifyEmailCode({ slug, email, code })` → `POST /identity/apps/{slug}/verify-code`, returns `{ redirectUrl }`.
- `getAppConfig(slug)` → `GET /identity/apps/{slug}/config`.
- `track(event)` / `trackBatch(events)` metering ingestion → `POST /metering/events[/batch]`.
- Generated types from the backend OpenAPI contract (`src/generated/openapi.ts`),
  re-exported as `EmailCodeRequest`, `VerifyCodeRequest`, `HostedAppConfig`,
  `AuthResult`, `AppIdentity`, `UsageEvent`, `IngestResult`, etc.

### Changed
- `InfiLogin` is now a two-step email → code form that redirects to the returned
  `redirectUrl`. New props: `slug`, `redirectTo`, `state`, `onVerified`.
- `exchangeCode` / `exchangeCodeFromRequest` and the hosted helpers
  (`buildHostedLoginUrl` / `startHostedLogin` / `extract*`) are unchanged.
- Example app renamed `next-magic-link` → `next-email-code`.
