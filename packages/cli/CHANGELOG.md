# Changelog

## 0.2.0 — 2026-08-18

The first command in the public docs could not succeed. Three defects, all in the cold-start path.

### Fixed
- **The CLI sent sandbox keys to the production API.** `apiBase()` fell back to
  `LIVE_API_BASE`, so a `sk_test_` key 401'd on every authenticated call and
  `POST /public/v1/claimables` — which live does not serve — 404'd. The host now comes
  from the key prefix, the same rule `resolveApiBase` applies in the SDK
  (`sk_live_` → `api.beinfi.com`, anything else → `api-sandbox.beinfi.com`).
  `--local` and `INFI_API_URL` still pin it; a saved profile's `baseUrl` still wins over
  the default but is outranked by an explicit `--key`.
- **The dashboard host is mode-aware too** (`app-sandbox.beinfi.com` in sandbox), so
  `go-live`, `providers` and `doctor` stop pointing a sandbox tenant at a live URL that
  404s. Override with `INFI_APP_URL`.
- **`infi doctor` no longer reports a wrong host as a pass.** It prints the host it will
  actually use plus the key's mode, **fails** when that host cannot serve the key, and
  warns (rather than passing silently) when the host was pinned by `--local` /
  `INFI_API_URL`. A sandbox `404` from the live-only provider surface is now explained
  instead of leaked as `Request failed`.
- **`infi bootstrap` no longer sends `intent`.** `POST /public/v1/claimables` answers
  `422 unrecognized field` for it and accepts only `ref`; the intent has always been a
  local knob that shapes the generated `infi.company.ts`, so it never needed to go on the
  wire. All four intents work again. `infi claim create` drops `--intent`, which provisions
  no catalog and therefore had nothing to do with it.
- **Failures are reported, and always exit non-zero.** Every command routes its error
  through one reporter: under `--json` it emits
  `{ ok: false, error: { message, status, code, errors[], fix } }` on stdout instead of
  prose on stderr, and the human path prints the per-field `errors[]` the API sends plus
  `fix.command` / `fix.hint` / `fix.docs`. `infi bootstrap` used to print success and exit
  0 when its own `doctor` run failed; it now exits 1 and lists the failing checks. Usage
  errors follow `--json` as well.
- **`fix` is surfaced, and it is no longer empty.** The docs tell agents to read
  `InfiError.fix.command` / `.hint`; it was `undefined` on every real 401/404/422 because
  the SDK's fix table only knew hand-written codes. `@beinfi/sdk` 0.10.1 fills in
  `validation_failed`, `auth_001`, `unauthorized` and `not_found`, and the CLI prints /
  emits whatever is there rather than promising something it never had.
- An error body with no JSON no longer surfaces as the bare word `Request failed`: HTTP/2
  sends no reason phrase, so the status is kept in the message. A 404 from the claimables
  endpoint says the host is wrong, because that is what it means.

- **`infi bootstrap` completes past `sync`.** Two blockers only a clean install shows:
  it imported the `infi.company.ts` it had just written, which Node reads as CommonJS in
  any project without `"type": "module"` (`Cannot use import statement outside a module`);
  and `sync` sent a version field the API rejects. Bootstrap now builds the config in
  memory from the intent, and `loadCompanyConfig` (used by `infi sync` / `infi pull`)
  retries an ESM-only `.ts` through a temporary `.mts` sibling instead of failing.

### Changed
- `bootstrap --json` output gains `apiBase` — the host the run actually talked to.
- `infi go-live` in sandbox says the built-in sandbox provider is doing the charging instead
  of reporting the live-only provider surface as unreadable.
- **Requires `@beinfi/sdk` >= 0.10.1.** 0.10.0's `sync` sends `creditsPerCycle`, which the
  API answers `422 unrecognized field` — publish the SDK before the CLI.

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
