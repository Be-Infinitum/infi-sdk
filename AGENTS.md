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

## Embedded checkout

The buyer pays **on the merchant's page**, in an iframe served from
`app.beinfi.com`. Alternative to sending them to the hosted `/pay/{slug}` link,
not a replacement: same backend, same webhooks.

```tsx
import { InfiCheckoutEmbed } from "@beinfi/checkout/react";

// href is the string links.create() returned — it carries slug + token.
<InfiCheckoutEmbed href={link.url} environment="sandbox" onComplete={() => setStep("thanks")} />
```

| Fact | Consequence |
|------|-------------|
| `onComplete` is a client-side event | **Fulfil on `payment.confirmed`**, verified with `verifyWebhook`. Never on `onComplete` |
| The public route is `/pay/{slug}/links/{token}` | `linkToken` needs `slug` too; `href={link.url}` avoids the question |
| `linkToken` is one product, `invoiceId` is a cart | Price a cart server-side with `infi.checkout({ payerId, lineItems })` — amounts are never browser-settable |
| `environment` has no default | `"sandbox"` \| `"production"`, always explicit |
| The merchant embeds our surface | Theming is `themeOptions` + `locale` + `hidePrice`, not their CSS |

No API key in the browser, and no server call per purchase. Card fields render in
the provider's own frame, so the merchant's PCI scope does not change.
Full instructions: `skills/embed-checkout/`.

## Recipes

| Intent | Skill |
|--------|--------|
| Sell a file or link | `skills/sell-digital-product/` |
| Charge with a link, build nothing | `skills/send-payment-link/` |
| Pay on the merchant's own page | `skills/embed-checkout/` |
| Prepaid AI chat | `skills/prepaid-ai-credits/` |
| Usage SaaS | `skills/usage-based-subscription/` |
| Confirm a test payment | `skills/test-payment-in-sandbox/` |

`infi skills list` / `infi skills install` copies these into `.claude/skills/`;
the MCP server serves the same files as `infi://skills/<id>`.

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
