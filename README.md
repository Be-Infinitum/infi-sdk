# Infi SDK monorepo

TypeScript SDK, CLI, and agent tooling for [Beinfi](https://beinfi.com) — auth, billing-as-code,
checkout, metering, and prepaid AI credits.

**Agents:** start with [`AGENTS.md`](./AGENTS.md).

## Packages

| Package | Description |
|---------|-------------|
| [`@beinfi/sdk`](./packages/sdk) | Core API client + `defineBilling()` + React UI |
| [`@beinfi/cli`](./packages/cli) | `infi` — init, sync, doctor, claim, deploy |
| [`@beinfi/auth`](./packages/auth) | Framework-agnostic auth (`Request`/`Response`) |
| [`@beinfi/nextjs`](./packages/nextjs) | Next.js App Router handlers |
| [`@beinfi/mcp`](./packages/mcp) | MCP server for Cursor / Claude |
| [`create-infi-app`](./packages/create-infi-app) | `npm create infi-app` |

## Quick start

```bash
bun install && bun run build

# Provision + scaffold
infi claim create --ref cursor --json
npm create infi-app my-app --template ai-chat

# Billing-as-code (TypeScript config — app can be any language)
infi sync infi.billing.ts --plan
infi sync infi.billing.ts
infi doctor --json
```

## Billing-as-code

Declare products, apps, and webhooks in `infi.billing.ts`:

```ts
import { defineBilling } from "@beinfi/sdk";

export default defineBilling({
  products: [{ key: "starter", type: "agent", pricingModel: "prepaid", ... }],
  apps: [{ slug: "my-app", allowedOrigins: ["http://localhost:3000"], redirectUris: [...] }],
});
```

The CLI interprets TypeScript at sync time — no need for the whole app to be TS.

## Examples

| Example | Use case |
|---------|----------|
| `examples/ai-chat` | Prepaid AI chat (`@beinfi/auth` + Hono) |
| `examples/ebook-sale` | One-time checkout + deliverable |
| `examples/marketplace-billing` | Usage SaaS + per-org rate cards |
| `examples/crm` | Metered CRM (`@beinfi/nextjs`) |

## Development

```bash
bun run codegen   # needs ../backend/api/openapi.yaml
bun run build
bun run test
bun run smoke
```

See [`packages/sdk/README.md`](./packages/sdk/README.md) for the full SDK surface.
