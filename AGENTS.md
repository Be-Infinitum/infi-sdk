# Infi SDK — agent integration guide

Single entry point for AI agents (Cursor, Claude, Lovable, MCP) integrating
[Beinfi](https://beinfi.com) — **company as code**: revenue + webhooks. Beinfi bills; it does not
handle your end-user login (bring your own auth).

## Quick start (preferred)

```bash
# One shot: claim + infi.company.ts + sync + doctor
infi bootstrap --intent crm --ref lovable --json
```

Intents: `crm` | `prepaid-ai-chat` | `one-time` | `usage-saas`

Inject `env.INFI_SECRET_KEY` into the app. **Do not set auth/pay URLs** — the SDK infers
API + `app.beinfi.com` from the key (`sk_test_` / `sk_live_`).

## Company as code

Declarative tenant config (git-versioned, Terraform-style):

```ts
// infi.company.ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany.fromIntent("crm");

// or hand-authored:
export default defineCompany({
  products: [...],
  webhooks: [...],
});
```

| Command | Purpose |
|---------|---------|
| `infi bootstrap --intent …` | Claim + write company file + sync |
| `infi sync` | Apply the desired state |
| `infi sync --plan` | Dry-run |
| `infi pull` | Backend → `infi.company.ts` |
| `infi doctor --json` | Setup health (products + provider + env) |
| `infi providers [list]` | BYOP connection status |
| `infi providers verify <p>` | Re-check a stored credential |
| `infi go-live --json` | Claim → connect provider → webhook |

`defineBilling` / `infi.billing.ts` still work as aliases.

## Credentials

| Var | Required | Notes |
|-----|----------|-------|
| `INFI_TENANT_SLUG` | for checkout | Merchant slug in the hosted `/pay/{slug}` URL |
| `INFI_SECRET_KEY` | yes | `sk_test_` sandbox / `sk_live_` once a provider is connected |
| `INFI_API_URL` | local only | Override; omit in Lovable/prod |
| `INFI_AUTH_BASE_URL` / `INFI_PAY_BASE_URL` | **no** | Legacy — remove |

## Wallet (meter ledger)

```ts
// externalId is YOUR user id, from your own auth.
const wallet = await infi.wallet.forCustomer(externalId, { productKey: "ai-chat" });
await wallet.debit("tokens", "120");
await wallet.credit({ meter: "tokens", amount: "50000" });
await wallet.balance("tokens");
// or: infi.wallet.bind(enrollmentId)
```

Plan grants (company as code): `grants: [{ meter: "tokens", amount: "50000", on: "cycle" }]`.

## Identity

Beinfi does not do login. Identify the payer with **your own** user id:

```ts
await infi.customers.create(productId, { externalId: myUserId });
```

The returned enrollment id is what every billing call references.

## Payment providers (BYOP)

The merchant connects **their own** Stripe or Asaas account. Money lands there; Beinfi never
holds it. Read state from the CLI:

```bash
infi providers list --json      # status, webhook registered, publishable key
infi providers verify stripe    # re-check after a key rotation
```

**Connecting is dashboard-only.** It decides where a merchant's money goes, so the backend
gates it behind fresh MFA, and a step-up token is only ever minted for a dashboard session —
an API key can neither obtain nor replay one. Agents must send the human to
`app.beinfi.com/go-live`; never try to connect with a key.

## Go-live (real money)

Sandbox is instant. Live is a **human** funnel — agents instruct, never skip a step:

1. Claim tenant (`claimUrl` from bootstrap)
2. Create Beinfi account
3. **Connect a payment provider** (dashboard, needs MFA) and register its webhook
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
`infi_sync_plan`, `infi_sync_apply`, `infi_pull`.

## Recipes

| Intent | Skill |
|--------|--------|
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
