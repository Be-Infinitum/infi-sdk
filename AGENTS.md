# Infi SDK — agent integration guide

This file is the **single entry point** for AI agents (Cursor, Claude, Lovable, MCP)
integrating [Beinfi](https://beinfi.com) billing, auth, and metering.

## Quick start

```bash
# 1. Provision sandbox tenant (or use existing sk_test_ key)
infi claim create --ref lovable --json   # or cursor, mcp, cli

# 2. Scaffold (optional)
npm create infi-app my-app --template ai-chat

# 3. Sync billing config (mandatory before login)
infi sync infi.billing.ts --plan   # preview
infi sync infi.billing.ts          # apply

# 4. Diagnose setup
infi doctor --json
```

Billing config is **TypeScript only** (`infi.billing.ts`). Your app can be any language;
the CLI interprets TS at sync time.

## Mandatory setup order

Never skip this order — skipping step 3 causes **infinite login loops**:

1. `INFI_SECRET_KEY` — `sk_test_...` or `sk_live_...`
2. `infi sync infi.billing.ts` — products **and** apps in one file
3. App-specific env (see matrix below)
4. `infi doctor` — must pass `products` and `app` checks before testing login

### Why products are required for login

Hosted login enrolls the identity as a **customer of the tenant's first product**.
With **zero products**, the session resolves without `customer.id` → every protected
route 401s → user lands back on the login screen after a "successful" exchange.

## Billing-as-code

Single declarative file reconciled idempotently (Terraform-style):

```ts
// infi.billing.ts
import { defineBilling } from "@beinfi/sdk";

export default defineBilling({
  products: [{ key: "my-product", type: "agent", pricingModel: "prepaid", ... }],
  apps: [{
    slug: "my-app",
    name: "My App",
    allowedOrigins: [process.env.APP_URL!],
    redirectUris: [`${process.env.APP_URL}/callback`],
  }],
  webhooks: [{
    url: `${process.env.APP_URL}/api/webhooks/infi`,
    events: ["payment.confirmed"],
  }],
});
```

| Command | Purpose |
|---------|---------|
| `infi sync infi.billing.ts --plan` | Dry-run diff |
| `infi sync infi.billing.ts` | Apply |
| `infi sync --force` | Overwrite dashboard drift |
| `infi pull` | Adopt dashboard → regenerate config + lock |
| `infi.billing.lock.json` | Drift fingerprint (commit it) |

**Never** call `infi.apps.create()` separately — put `apps` inside `defineBilling()`.

## Credentials {#credentials}

| Var | Purpose |
|-----|---------|
| `INFI_SECRET_KEY` | Server-side API key (`sk_test_` = sandbox) |
| `INFI_API_URL` | Backend API (default sandbox: `https://api-sandbox.beinfi.com`, local: `:8088`) |
| `INFI_AUTH_BASE_URL` | **Frontend** serving hosted login (`/identity/{slug}/login`) — NOT the API |
| `INFI_PAY_BASE_URL` | **Frontend** serving hosted checkout — NOT the API |
| `INFI_SLUG` / `NEXT_PUBLIC_INFI_APP_SLUG` | Identity app slug |
| `INFI_WEBHOOK_SECRET` | `whsec_...` for `verifyWebhook()` |

### Env var matrix (common mistakes)

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `INFI_AUTH_BASE_URL` = API URL | 404 on login | Point to frontend `:3000` |
| Skipped `infi sync` | Login loop | Run sync with products + apps |
| Reload old `/callback?code=` | Silent login failure | Fresh login (codes expire in **60s**) |
| `customerId` vs `enrollmentId` | Credits/meter wrong id | Use **enrollment** id for `credits.*`, `meter()`, `state()` |

## ID model (critical)

- **Tenant customer** — from `getSession().customer.id` (identity-linked)
- **Enrollment** — `ProductCustomer.id` from `products.enroll()` — **this is the wallet id**
- `infi.customers.credits.*`, `infi.meter()`, `infi.customers.state()` expect the **enrollment id**

## Auth (framework-agnostic)

Use `@beinfi/auth` for non-Next stacks (Hono, Vite, Workers):

```ts
import { createLoginHandler, createCallbackHandler, createStateHandler } from "@beinfi/auth";
```

Next.js App Router: use `@beinfi/nextjs` (`Login`, `Callback`, `State`, `withMeter`).

## MCP (Cursor / Claude Desktop)

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

Tools: `infi_claim_create`, `infi_doctor`, `infi_sync_plan`, `infi_sync_apply`, `infi_pull`.

## Recipes (by intent)

| Intent | Template / skill |
|--------|------------------|
| **Lovable + Supabase** | **`skills/lovable-integration/`** |
| Prepaid AI chat (tokens) | `templates/ai-chat`, `skills/add-prepaid-ai-chat/` |
| One-time file sale | `templates/ebook-sale`, `skills/add-one-time-checkout/` |
| Usage-based SaaS | `templates/marketplace-billing`, `skills/add-usage-based-saas/` |

### Streaming LLM + credits

Use `infi.meter({ mode: "streaming" })` — gates credit pre-flight, records in `onFinish`:

```ts
await infi.meter({ customerId: enrollmentId, meter: "tokens", mode: "streaming" }, () =>
  streamText({ ..., onFinish: ({ usage }) => credits.consume(enrollmentId, { amount: String(usage.totalTokens) }) })
);
```

## Auth gotchas {#auth-gotchas}

- Auth codes expire in **60 seconds**
- Failed callback exchange may redirect silently — check server logs
- Hosted login requires app `allowedOrigins` + `redirectUris` synced via `apps[]`

## Examples

Each example has a detailed runbook in `CLAUDE.md`:

| Example | Port | Auth |
|---------|------|------|
| `examples/ai-chat` | 5173/3012 | `@beinfi/auth` + Hono |
| `examples/crm` | 3010 | `@beinfi/nextjs` |
| `examples/ebook-sale` | 3011 | No login (checkout only) |
| `examples/marketplace-billing` | 3013 | `@beinfi/nextjs` |

## Structured errors

`InfiError` includes `code` and `fix.command` for agent automation:

```json
{
  "code": "missing_code",
  "fix": { "hint": "Auth codes expire in 60s...", "docs": "AGENTS.md#auth-gotchas" }
}
```

Run `infi doctor --json` for setup-level fixes.
