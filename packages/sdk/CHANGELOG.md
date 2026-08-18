# Changelog

## 0.10.0

Fixes from the 2026-08-17 cold-start audit: payment links now work in sandbox, and a
rejected write tells you which field is wrong.

### Fixed
- **`InfiError` carries the API's field-level validation details.** A 422 answers
  `errors: [{ field, description }]`; the SDK used to drop it, so callers got a status
  and nothing else. It is now `err.errors` (always an array), it is in `toJSON()`, and
  the first description is folded into `err.message` — the generic *"One or more fields
  are invalid."* alone told you nothing. `parseErrorResponse` also reads the flat
  `error_code` the live API sends, so `err.code` (and therefore `err.fix`) is populated
  instead of `undefined`.
- **The app host is mode-aware.** `resolveApiBase` switched hosts per mode but the app
  base was the single constant `app.beinfi.com`, so every `sk_test_` caller got payment
  link and `checkout()` URLs on the live host, which 404. Sandbox now resolves to
  `app-sandbox.beinfi.com`. An explicit `appUrl` still wins.
- **An empty `slug` throws instead of building a broken URL.** `checkout()` interpolated
  a missing slug and handed back `…/pay/undefined/invoices/…`; untyped JS callers got no
  signal. `checkout`, `links.create` and `links.urlFor` now throw `missing_slug` (400,
  with a `fix` hint) — and `checkout` / `links.create` check before they create anything,
  so a bad call costs nothing. `links.list` without a slug still returns `url: ""`.

### Added
- `resolveAppBase(mode, override?)`, `SANDBOX_APP_BASE`, `LIVE_APP_BASE` — the app-host
  mirror of `resolveApiBase`.
- `InfiFieldIssue` — the `{ field, description }` shape of `InfiError.errors`.
- The `PaymentLink` type is exported. `PaymentLinkWithUrl` is defined in terms of it, so
  it should have been reachable from 0.9.0.

### Changed
- JSDoc on the public surface rewritten for the people who read it in an editor tooltip:
  no internal file paths, ADR numbers, competitor comparisons or product history. The
  operational warnings stay — `apiKeys` and `providers` are account-owner surface that an
  API key cannot reach, and `providers` is live-only.
- `Infi.sync` and the company-as-code exports are no longer marked "do not document or
  promote". Company as code is a documented, supported feature; the note was the stale part.
- `Payment.pixPayload` now documents both cases: an EMV/brcode string in live (render the
  QR from it), a simulator URL in sandbox (link to it, do not QR-encode it).
- `DEFAULT_APP_BASE` is deprecated — an alias of `LIVE_APP_BASE`. Use `resolveAppBase`.
- `CHANGELOG.md` now ships in the published tarball.

### Notes
- `@beinfi/nextjs`, `@beinfi/cli` and `@beinfi/mcp` widened their `@beinfi/sdk` range to
  `>=0.9.0 <0.11.0`. A caret on a 0.x version pins the *minor*, so `^0.9.0` would not
  resolve 0.10.0.

## 0.9.0

### Removed — BREAKING: the raw-PAN card path
Card capture put the PAN in the merchant's DOM and then sent it through our servers to be
tokenized, pulling both sides into PCI scope. Removed:
- `InfiCardForm`, `InfiCheckout`, `InfiPixQr` (from `@beinfi/sdk/react`)
- the `card` argument on `pay.charge()` and the `CardInput` type

`pay.charge({ method: "card" })` **stays**: it returns the `clientSecret` +
`publishableKey` of the provider routing picked, for the browser to confirm directly with
that provider.

### Added — payment links
- `infi.links.create/list/revoke/urlFor` — mint a shareable URL bound to a product. The
  payer fills in their own details; the customer and invoice are materialized on submit.
  New type `PaymentLinkWithUrl`.

### Removed — BREAKING: auth is no longer part of Beinfi

Beinfi is billing only; merchants bring their own auth. Everything
that existed to log an end user in is gone:

- `sendEmailCode`, `verifyEmailCode`, `getAppConfig`, `exchangeCode`,
  `exchangeCodeFromRequest`, `getSession`
- the `apps` resource (`apps.list/create/update`)
- `InfiLogin` (from `@beinfi/sdk/react`), `buildHostedLoginUrl`, `startHostedLogin`,
  `extractCodeFromUrl`, `extractTokenFromUrl`, `setSessionCookie`, `clearSessionCookie`
- company-as-code `apps[]`: `BillingApp`, `withAppUrl`, and the `appUrl` option on
  `defineCompany.fromIntent`. `infi sync` no longer patches origins.
- types `App`, `AppIdentity`, `AuthResult`, `SessionIntrospection`, `SessionMode`,
  `SessionPayload`, `HostedAppConfig`, `EmailCodeRequest`, `VerifyCodeRequest`,
  `ExchangeRequest`, `ExchangeCodeOptions`, `SendEmailCodeOptions`,
  `VerifyEmailCodeOptions`, `StartHostedLoginOptions`, `InfiRequestLike`,
  `InfiResponseLike`, and `CustomerSummary.identityId`

`exchangeCliToken` **stays** — that is operator/CLI auth (`/auth/cli/token`), not
end-user login.

### Changed — BREAKING

- **`wallet.fromSession(token, opts)` → `wallet.forCustomer(externalId, opts)`.** It still
  resolves productKey → product → enroll → starter credits → bound wallet; it just takes
  your own user id instead of an Infi session token. `Wallet.customerId` → `Wallet.externalId`,
  and `Wallet.session` is gone.

### Migration

```diff
- const wallet = await infi.wallet.fromSession(sessionToken, { productKey: "ai-chat" });
+ const wallet = await infi.wallet.forCustomer(myUserId, { productKey: "ai-chat" });
```

Replace Infi login with any auth you like (Clerk, Supabase, NextAuth, your own), then pass
that user's id as `externalId`. The enrollment id it returns is unchanged.


### Fixed
- `products.create` now unwraps the backend's `{ product, version }` response
  (previously returned the wrapper, so `.id` was undefined against the real API).
- `track` / `trackBatch` send an `Idempotency-Key` header and auto-generate a
  per-event `eventId` when omitted — the metering ingest requires both.
- `session(customerId, productId?)` stamps `productId` on each event (the ingest
  requires it). Verified end-to-end against the sandbox.

### Changed
- **`new Infi` takes `mode`, not base URLs.** Replaced `baseUrl`/`authBaseUrl`/
  `payBaseUrl` with `mode: "sandbox" | "live"` (inferred from the key prefix —
  `sk_live_` → live, else sandbox) plus optional `apiUrl`/`appUrl` overrides for
  local dev. The SDK resolves the API host from mode (sandbox →
  api-sandbox.beinfi.com, live → api.beinfi.com); you never pass a base for prod.
  React props and `@beinfi/nextjs` adapter options renamed `baseUrl` → `apiUrl`,
  `authBaseUrl` → `appUrl`. Constants `DEFAULT_API_BASE`/`DEFAULT_AUTH_BASE`/
  `DEFAULT_PAY_BASE` → `SANDBOX_API_BASE`/`LIVE_API_BASE`/`DEFAULT_APP_BASE`; new
  `modeFromKey`, `resolveApiBase`, and the `InfiMode` type.
- **Rename sandbox → claim**. "Sandbox" now means only
  test-vs-live mode; the provision-instant-creds-then-claim flow is a *claimable
  tenant*. CLI: `infi sandbox create|get` → `infi claim create|get`; `@beinfi/cli`
  helpers `createSandbox`/`getSandbox` → `createClaimable`/`getClaimable`, types
  `ClaimableSandbox*`/`SandboxRef` → `ClaimableTenant*`/`ClaimRef`. Scaffolded env
  `INFI_SANDBOX_ID`/`INFI_SANDBOX_CLAIM_URL` → `INFI_CLAIM_ID`/`INFI_CLAIM_URL`.
  Public endpoint `/public/v1/sandbox` → `/public/v1/claimables`.

### Added
- `infi.invoices.fromUsage({ customerId, from, to, send })` — roll an enrollment's
  accrued usage over a window into a finalized invoice on demand, rated server-side
  (backend `POST /billing/invoices/from-usage`; subscription-free). No more building
  usage line items by hand. New type `FromUsageInput`.
- `infi.session(customerId)` — a batching usage session (`track(...).track(...)` then
  `flush()`), sugar over `trackBatch`. New export `MeteringSession`.
- `examples/ai-agent-billing` — end-to-end demo: real OpenAI + Gemini calls, usage
  session, `fromUsage` invoice, webhook (ngrok + `verifyWebhook`) waiting for
  `payment.confirmed`.
- `infi.products.meters.update(productId, meterId, patch)` — update a meter's
  displayName / unit / aggregation (backend `PATCH …/meters/{id}`; `name` immutable).
  `infi.sync()` now reconciles meter metadata (create + update). New type
  `UpdateMeterRequest`.
- Billing-as-code desired-state sync: `infi.sync()` now **updates**
  product metadata and **version-bumps** on price / base-price / credits / billing-cycle
  changes (a new version is published; prior versions stay immutable), instead of
  seed-only. `SyncAction.action` gains `"update"` and `"bump"` plus a `detail` reason;
  `infi sync --plan` prints them.
- Billing-as-code platform config: `defineBilling()` accepts `apps`
  (matched by slug) and `webhooks` (matched by url); `infi.sync()` reconciles them
  create + update, never deletes, never rotates a webhook secret. Drift-guarded like
  products (a dashboard edit blocks an update unless `--force`); the lock tracks
  `apps`/`webhooks`; `infi pull` emits them. New types `BillingApp` / `BillingWebhook`
  / `EntityLock`; `SyncAction.resource` adds `app` / `webhook`.
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
  `@beinfi/cli/lib/provision`. No app runtime called this.

## 0.8.1

### Added
- `infi.sandbox.create({ ref })` — provision a claimable billing sandbox (public, no auth).
- `infi.sandbox.get(id)` — poll public sandbox claim status.
- `infi.apiKeys.list/create/revoke` — tenant API key management.
- `exchangeCliToken()` — exchange dashboard session for CLI API key (`POST /auth/cli/token`).

## 0.8.0

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
