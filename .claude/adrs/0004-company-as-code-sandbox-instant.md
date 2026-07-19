# ADR 0004 — Company as code + sandbox instant + go-live

**Status:** Accepted (2026-07)

## Context

ADR 0002 introduced desired-state sync for catalog + apps + webhooks under the
name "billing as code". In practice the declarative file describes the **tenant /
company** on Infi (identity apps, revenue products, integrations) — not just
prices. Separately, vibe-coding agents (Lovable, Cursor, Claude) need a sandbox
that becomes usable in one step; production readiness is a human funnel
(claim → account → KYC), not another sync flag.

## Decision

### 1. Company as code

- Canonical name: **company as code**.
- Authoring API: `defineCompany(config)` (alias of `defineBilling`).
- File: prefer `infi.company.ts`; still accept `infi.billing.ts`.
- Lock: `infi.company.lock.json` (or legacy `infi.billing.lock.json` beside billing file).
- Intents: `defineCompany.fromIntent("crm" | "prepaid-ai-chat" | "one-time" | "usage-saas", opts)`
  produces a full config agents can sync without hand-writing meters/prices.

### 2. Sandbox instant (product expectation)

Sandbox (`sk_test_`) should require **only** `INFI_SECRET_KEY` (+ slug when needed).
API/auth/pay hosts are inferred by the SDK from the key prefix (already true).

**Backend follow-ups (not blocked on this ADR):**
- Skip origin / redirect / CORS allowlist enforcement in sandbox.
- Optional claim body `{ intent, appUrl }` seeds catalog so first login works
  without a prior sync (CLI bootstrap still syncs for determinism).

### 3. Bootstrap

`infi bootstrap --intent <id> --ref <channel> [--app-url] [--json]`:
claim → write minimal env → write `infi.company.ts` → sync → doctor.

### 4. Go-live

Going live is **not** `sync --live`. It is:

1. Claim the sandbox tenant (ownership)
2. Create a Beinfi account
3. Complete KYC
4. Issue `sk_live_` and switch deploy secrets

CLI/MCP expose `infi go-live` / `infi_go_live_status` that return `{ stage, next, urls }`
so agents instruct the human — they never automate KYC.

## Consequences

- Docs and skills say "company as code"; billing naming remains as alias.
- Templates/env stop advertising `INFI_AUTH_BASE_URL` / `INFI_PAY_BASE_URL`.
- MCP stays in this monorepo and uses `@beinfi/sdk` + CLI libs underneath.
