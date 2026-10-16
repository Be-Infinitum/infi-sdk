# Infi SDK — agent integration guide

Single entry point for AI agents (Cursor, Claude, Lovable, MCP) integrating
[Beinfi](https://beinfi.com) — **company as code**: revenue + webhooks. Beinfi bills; it does not
handle your end-user login (bring your own auth).

## Quick start (preferred)

```bash
# One shot: claim + infi.company.ts + sync + doctor
infi bootstrap --intent usage-saas --ref lovable --json
```

Intents: `prepaid-ai-chat` | `one-time` | `usage-saas`

Inject `env.INFI_SECRET_KEY` into the app. **Do not set auth/pay URLs** — the SDK infers
API + `app.beinfi.com` from the key (`sk_test_` / `sk_live_`).

## Company as code

Declarative tenant config (git-versioned, Terraform-style):

```ts
// infi.company.ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany.fromIntent("usage-saas");

// or hand-authored:
export default defineCompany({
  products: [...],
  webhooks: [...],
});
```

The server plans and applies it (backend ADR 0025). The file is serialized to the
company document — validate against the JSON Schema at
`https://api.beinfi.com/config/schema/v1.json` before planning. Schema v1 rules:
`price.meter` required (a flat amount is `basePrice`), `aggregation` is `sum`|`count`,
webhooks are `https://` only, one grant per meter per version. Deliverables and
coupons are **not** in the document (use `infi.products.deliverable.save` /
`infi.coupons` after the sync).

| Command | Purpose |
|---------|---------|
| `infi bootstrap --intent …` | Claim + write company file + sync |
| `infi sync --plan` | The plan, in sentences. Writes nothing |
| `infi sync` | Plan + apply. Sandbox: applied. **Live: a proposal** (prints the approval link) |
| `infi pull` | The tenant's document (`GET /config/document`) → `infi.company.ts` |
| `infi promote <crev_…>` | Applied sandbox revision → live, as a proposal |
| `infi doctor --json` | Setup health (products + merchant-of-record admission + env) |
| `infi go-live --json` | Claim → merchant-of-record admission → `sk_live_` |

`defineBilling` / `infi.billing.ts` still work as aliases.

**Live is always a proposal.** With an `sk_live_` key, `infi sync` and `infi_sync_apply`
return an `approvalUrl`: give it to the human. Nothing changes on live until a person
approves it in the dashboard (step-up, which no key can obtain). Never retry the apply.

**Held changes.** A plan can hold a change; nothing is applied and each held change
names the option that resolves it. Ask the human which; never pick one yourself:

| Reason | Option | Means |
|--------|--------|-------|
| `unmanaged` | `adoptUnmanaged` / `--adopt-unmanaged` | Exists in the tenant, no revision wrote it (first sync after upgrading from CLI ≤ 0.2.8) |
| `drift` | `overwriteDrift` / `--overwrite-drift` | Edited in the dashboard since the last apply. `infi pull` keeps the edit instead |
| orphaned | `archiveOrphaned` / `--archive-orphaned` | The file no longer names it. Archived, never deleted |
| `active_subscriptions`, `selling_links`, `immutable_field`, `rename_conflict` | none | Fix the cause; the sentence says what |

**Stale plan** (exit 3, `status: "stale"`): the tenant moved between plan and apply. Show
the new plan and ask again; it is never applied unseen.

**Webhook secrets** of endpoints an apply creates come back once (`secrets`). Store them
in the app's server secrets right away; they are never shown again and never written to
disk.

There are no lock files any more; delete `infi.company.*.lock.json`.

## Credentials

| Var | Required | Notes |
|-----|----------|-------|
| `INFI_TENANT_SLUG` | for checkout | Merchant slug in the hosted `/pay/{slug}` URL |
| `INFI_SECRET_KEY` | yes | `sk_test_` sandbox / `sk_live_` once the merchant-of-record admission is approved |
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

## Go-live (real money)

Sandbox is instant. Live is a **human** funnel — agents instruct, never skip a step:

1. Claim tenant (`claimUrl` from bootstrap)
2. Create Beinfi account
3. **Merchant-of-record admission**: Infi's UK Ltd is the seller of record and the
   merchant supplies through it. The account owner applies in the dashboard at
   `app.beinfi.com/go-live`; never fill or submit it for them.
4. Create `sk_live_`, replace secrets, `infi doctor`

```bash
infi go-live --json
# MCP: infi_go_live_status
```

Connecting the merchant's own Stripe/Asaas (BYOP) is an enterprise arrangement, not
part of this path; `infi providers list` only reports it where it exists.

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

`infi_sync_apply` with a live key **proposes**: it returns the approval link for the
human and never applies or retries. `infi_bootstrap`, `infi_onboard` and
`infi_claim_create` provision a sandbox and refuse a live key.

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
