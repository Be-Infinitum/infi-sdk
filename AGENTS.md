# Infi SDK — agent integration guide

Single entry point for AI agents (Cursor, Claude, Lovable, MCP) integrating
[Beinfi](https://beinfi.com) — **company as code**: identity + revenue + webhooks.

## Quick start (preferred)

```bash
# One shot: claim + infi.company.ts + sync + doctor
infi bootstrap --intent crm --ref lovable --app-url https://xxx.lovable.app --json
```

Intents: `crm` | `prepaid-ai-chat` | `one-time` | `usage-saas`

Inject `env.INFI_SECRET_KEY` (+ `INFI_SLUG`) into the app. **Do not set auth/pay URLs** —
the SDK infers API + `app.beinfi.com` from the key (`sk_test_` / `sk_live_`).

## Company as code

Declarative tenant config (git-versioned, Terraform-style):

```ts
// infi.company.ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany.fromIntent("crm", {
  appUrl: process.env.APP_URL,
});

// or hand-authored:
export default defineCompany({
  products: [...],
  apps: [{ slug: "crm", name: "CRM", allowedOrigins: [...], redirectUris: [...] }],
  webhooks: [...],
});
```

| Command | Purpose |
|---------|---------|
| `infi bootstrap --intent …` | Claim + write company file + sync |
| `infi sync [--app-url]` | Apply / patch origins |
| `infi sync --plan` | Dry-run |
| `infi pull` | Backend → `infi.company.ts` |
| `infi doctor --json` | Setup health |
| `infi go-live --json` | Claim → account → KYC guidance |

`defineBilling` / `infi.billing.ts` still work as aliases.

## Credentials

| Var | Required | Notes |
|-----|----------|-------|
| `INFI_SECRET_KEY` | yes | `sk_test_` sandbox / `sk_live_` after KYC |
| `INFI_SLUG` | usually | App slug for hosted login |
| `APP_URL` | recommended | Preview/prod origin for allowlists |
| `INFI_API_URL` | local only | Override; omit in Lovable/prod |
| `INFI_AUTH_BASE_URL` / `INFI_PAY_BASE_URL` | **no** | Legacy — remove |

## Wallet (meter ledger)

```ts
const wallet = await infi.wallet.fromSession(token, { productKey: "ai-chat" });
await wallet.debit("tokens", "120");
await wallet.credit({ meter: "tokens", amount: "50000" });
await wallet.balance("tokens");
// or: infi.wallet.bind(enrollmentId)
```

Plan grants (company as code): `grants: [{ meter: "tokens", amount: "50000", on: "cycle" }]`.

## Auth

- Non-Next: `@beinfi/auth` (Web `Request`/`Response`)
- Next.js: `@beinfi/nextjs`

## Go-live (real money)

Sandbox is instant. Live is a **human** funnel — agents instruct, never skip KYC:

1. Claim tenant (`claimUrl` from bootstrap)
2. Create Beinfi account
3. Complete KYC
4. Create `sk_live_`, replace secrets, `infi doctor`

```bash
infi go-live --json
# MCP: infi_go_live_status
```

## MCP

```json
{
  "mcpServers": {
    "infi": {
      "command": "npx",
      "args": ["-y", "@beinfi/mcp"],
      "env": { "INFI_SECRET_KEY": "sk_test_..." }
    }
  }
}
```

Tools: `infi_bootstrap`, `infi_claim_create`, `infi_doctor`, `infi_go_live_status`,
`infi_sync_plan`, `infi_sync_apply`, `infi_set_app_url`, `infi_pull`.

## Recipes

| Intent | Skill |
|--------|--------|
| Lovable + Supabase | `skills/lovable-integration/` |
| Prepaid AI chat | `skills/add-prepaid-ai-chat/` |
| One-time sale | `skills/add-one-time-checkout/` |
| Usage SaaS | `skills/add-usage-based-saas/` |

## Streaming LLM + credits

```ts
await infi.meter({ customerId: wallet.enrollmentId, meter: "tokens", mode: "streaming" }, () =>
  streamText({ onFinish: ({ usage }) =>
    infi.customers.credits.consume(wallet.enrollmentId, { amount: String(usage.totalTokens ?? 0) })
  })
);
```

## Structured errors

`InfiError.fix.command` / `hint` for agent automation. Prefer `infi doctor --json`.

## See also

- ADR 0004 — company as code + sandbox instant + go-live
- ADR 0002 — desired-state sync invariants
