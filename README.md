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
infi bootstrap --intent usage-saas --ref cursor --json

# Or scaffold an example app
npm create infi-app my-app --template ai-chat
infi doctor --json
```

## Company as code

Declare the company (products, webhooks) in TypeScript — app can be any language:

```ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany.fromIntent("usage-saas");
```

Hosts (API / app) are inferred from `INFI_SECRET_KEY`. Go-live (claim → merchant-of-record
admission → `sk_live_`) via `infi go-live`.

The server plans and applies the file (ADR 0025). `infi sync` sends it as a document
(schema: [`/config/schema/v1.json`](https://api.beinfi.com/config/schema/v1.json)),
prints the plan in sentences, and applies it with `Idempotency-Key = planHash`. On live
an apply is a **proposal**: it prints a link where a person approves it. Held changes
name the flag that resolves them (`--adopt-unmanaged`, `--overwrite-drift`,
`--archive-orphaned`). There is no lock file; `infi pull` writes the server's own
document. `infi promote <crev>` takes an applied sandbox revision to live as a proposal.

## Examples

| Example | Use case |
|---------|----------|
| `examples/ai-agent-billing` | Script: company-as-code → AI calls → usage invoice → webhooks |

The Next.js example apps and the `templates/` scaffolds were removed along with
auth-as-a-service; they will be rebuilt around the billing-only surface.

## Development

```bash
bun run codegen   # needs ../backend/api/openapi.yaml
bun run build
bun run test
bun run smoke
```

See [`packages/sdk/README.md`](./packages/sdk/README.md) for the full SDK surface.
