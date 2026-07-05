# create-infi-app

Scaffold a billable Next.js app with Infi auth, hosted checkout, and usage billing in one command.

## Usage

```bash
npm create infi-app my-app
# or
npx create-infi-app my-app
```

### Options

| Flag | Description |
|------|-------------|
| `--template <id>` | `default`, `crm`, `ebook-sale`, `ai-chat`, `marketplace-billing` |
| `--local` | Point at local Infi API (:8088) and frontend (:4003) |
| `--skip-provision` | Skip sandbox creation; write `.env.example` only |
| `--skip-install` | Skip dependency install |
| `--skip-setup` | Skip `db:push` and `setup` |
| `-y` | Skip prompts |

## What you get (default template)

- Next.js 15 + Tailwind 4 + shadcn/ui
- PostgreSQL via Docker Compose + Prisma
- **`infi.billing.ts`** — billing-as-code source of truth
- Hosted auth, prepaid checkout, dashboard with `UsagePanel`
- Landing + claim banner for your Infi sandbox

## Development (monorepo)

```bash
bun install
bun run templates:normalize
bun run --filter create-infi-app build
bun run --filter create-infi-app dev -- my-app -y --skip-provision
```

## Publish

```bash
bun run publish:packages   # requires npm login / NPM_TOKEN
```
