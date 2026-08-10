# Changelog

## Unreleased

### Added
- **`infi providers [list]`** and **`infi providers verify <provider>`** — BYOP connection
  status: which provider is connected, whether its webhook is registered, the publishable
  key, and when it was last verified.
- `infi doctor` now checks the **payment provider**, which is the actual gate to real money
  (backend ADR 0012 replaced KYC with bring-your-own-provider). A `sk_live_` key with no
  connected provider **fails** the check — charges would have nowhere to land. Sandbox only
  warns. A connected provider with an unregistered webhook warns: you would never learn that
  a payment succeeded.

  There is deliberately **no `infi providers connect`**. Connecting decides which account a
  merchant's money lands in, so the backend gates it behind fresh MFA, and a step-up token is
  only ever minted for a dashboard session — an API key can neither obtain nor replay one.
  The CLI reports and verifies; connecting is a dashboard action.

### Changed
- **`infi go-live` no longer talks about KYC.** Its stages were `kyc_pending` / `kyc_approved`,
  which stopped existing when BYOP replaced KYC. New stages: `sandbox_unclaimed` →
  `provider_needed` → `webhook_pending` → `live_ready`, and it now *reads* the provider
  connection instead of inferring readiness from a claim id. `urls.kyc` → `urls.connect`.
- Generated env carries `INFI_TENANT_SLUG` (the merchant slug the hosted `/pay/{slug}`
  checkout needs) in place of the removed `INFI_SLUG` / `NEXT_PUBLIC_INFI_APP_SLUG`.

### Removed — BREAKING
- `--app-url` on `bootstrap`, `claim create` and `sync`; `APP_URL` / `INFI_SLUG` /
  `NEXT_PUBLIC_INFI_APP_SLUG` in generated env; the identity-app check in `doctor`; apps in
  `pull`. All of it configured auth-as-a-service, which no longer exists.
- `infi init --template <id>` has no templates to scaffold: the `templates/` tree was removed
  with auth-as-a-service and will be rebuilt around the billing-only surface.
