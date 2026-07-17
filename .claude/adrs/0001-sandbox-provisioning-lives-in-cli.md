# ADR 0001 — Sandbox provisioning lives in the CLI, not the SDK client

**Status:** Accepted (2026-07)

## Context

`@beinfi/sdk` exposed `infi.sandbox.create()` / `infi.sandbox.get()` on the main
`Infi` client (a `SandboxResource`). The `Infi` client is the runtime client an
integrating app imports server-side: identity (login/exchange/session), metering,
credits, invoices, checkout, webhooks. Sandbox provisioning is different in kind —
it is a dev-time / onboarding action (spin up a claimable test tenant, get an
`sk_test_` + claim URL), done once at setup, never during a request.

The only consumers of `infi.sandbox` were dev tooling: `@beinfi/cli`
(`sandbox create|get` commands, `lib/provision`) and `create-infi-app` (via the
CLI). No app runtime called it. Keeping it on `Infi` implied (wrongly) that apps
mint sandboxes at runtime, and it was the only resource hitting the unauthenticated
`/public/v1/sandbox` endpoint, out of step with the secret-key resource pattern.

## Decision

Remove the sandbox surface from `@beinfi/sdk`. Provisioning lives in `@beinfi/cli`
as plain functions (`createSandbox` / `getSandbox` in `lib/sandbox.ts`) over the
public `POST|GET /public/v1/sandbox` endpoints. Types (`SandboxRef`,
`ClaimableSandboxCreateResponse`, `ClaimableSandboxPublicView`) move to the CLI and
are re-exported from `@beinfi/cli/lib/provision`. `create-infi-app` imports the type
from the CLI instead of the SDK. The scaffolded `default` template's dev-only claim
banner polls the public endpoint with a plain `fetch` (no SDK dependency).

## Consequences

- `@beinfi/sdk` public surface is smaller and coherent: everything on `Infi` is app
  runtime, all secret-key resources follow one pattern.
- `create-infi-app` now depends on `@beinfi/cli` for the sandbox type (it already
  depended on the CLI for provisioning) — no new coupling.
- The generated OpenAPI types still carry the sandbox schemas (the backend endpoints
  are unchanged); only the hand-written client wrapper moved.
- Breaking for any external caller of `infi.sandbox.*` — none exist today.

## Alternatives considered

- **Keep it on `Infi`.** Rejected: pollutes the runtime surface and misrepresents a
  setup action as a runtime one.
- **Separate `@beinfi/sandbox` package.** Overkill for two fetch calls used only by
  the CLI; adds a package to publish/version for no runtime consumer.

## Non-goals

Changing the backend `/public/v1/sandbox` endpoints or the claim flow. This is a
client-surface relocation only.
