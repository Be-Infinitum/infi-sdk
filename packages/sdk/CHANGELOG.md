# Changelog

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
