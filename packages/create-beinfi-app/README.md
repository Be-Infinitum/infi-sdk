# create-beinfi-app

Scaffold a billable Next.js app with Infi auth, hosted checkout, and usage billing in one command.

## Usage

```bash
npx create-beinfi-app my-app
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
- Hosted auth (`@beinfi/nextjs`)
- Prepaid credits + hosted checkout
- Dashboard with `UsagePanel`
- Landing page + claim banner for your Infi sandbox

## Development (monorepo)

```bash
bun install
bun run templates:normalize   # copy examples → templates/
bun run --filter create-beinfi-app build
bun run --filter create-beinfi-app dev -- my-app -y --skip-provision
```

## Publish

From repo root after `bun run build`:

```bash
npm publish --workspace @beinfi/sdk
npm publish --workspace @beinfi/nextjs
npm publish --workspace create-beinfi-app
```

Requires `NPM_TOKEN` with access to the `@beinfi` scope and `create-beinfi-app`.
