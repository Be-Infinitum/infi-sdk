# Infi SDK monorepo

TypeScript SDK, CLI, and agent tooling for [Beinfi](https://beinfi.com) — auth, billing-as-code,
checkout, metering, and prepaid AI credits.

**Agents:** start with [`AGENTS.md`](./AGENTS.md).

## Packages

| Package | Description |
|---------|-------------|
| [`@beinfi/sdk`](./packages/sdk) | Core API client + `defineBilling()` + React UI |
| [`@beinfi/cli`](./packages/cli) | `infi` — init, sync, doctor, claim, deploy |
| [`@beinfi/nextjs`](./packages/nextjs) | Next.js App Router handlers |
| [`@beinfi/mcp`](./packages/mcp) | MCP server for Cursor / Claude |

## Quick start

```bash
bun install && bun run build

# One-shot company setup (claim + infi.company.ts + sync + doctor)
infi bootstrap --intent crm --ref cursor --json

# Or scaffold an example app
npm create infi-app my-app --template ai-chat
infi doctor --json
```

## Company as code

Declare the company (products, webhooks) in TypeScript — app can be any language:

```ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany.fromIntent("crm", {
  appUrl: process.env.APP_URL,
});
```

Hosts (API / auth / pay) are inferred from `INFI_SECRET_KEY`. Go-live (claim → KYC) via `infi go-live`.

## Examples

| Example | Use case |
|---------|----------|
| `examples/ai-agent-billing` | Script: company-as-code → AI calls → usage invoice → webhooks |

## Templates

```bash
npm create infi-app@latest minha-loja -- --template ecommerce   # or: infi init minha-loja --template ecommerce
```

`templates/ecommerce` — store, checkout (pix and card) in the Infi frame, digital delivery,
monthly subscription and the buyer's "Minhas compras" (`@beinfi/elements-react`). No key ships in
the template or in its zip (`bun run templates:pack`): `infi login` opens the browser (or shows a
code with `--device`), gives the project its own named `sk_test_`, and `infi sync` seeds the
catalog from `infi.company.ts` (schemaVersion, `ecommerce/` keys, coupons with `sandboxOnly`,
store, delivery files; one lock per mode). The old starters (CRM, marketplace, …) are retired.

## Development

```bash
bun run codegen   # needs ../backend/api/openapi.yaml
bun run build
bun run test
bun run smoke
```

See [`packages/sdk/README.md`](./packages/sdk/README.md) for the full SDK surface.
