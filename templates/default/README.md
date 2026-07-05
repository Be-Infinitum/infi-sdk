# __APP_NAME__

Fullstack starter gerado com [create-infi-app](https://github.com/Be-Infinitum/infi-sdk): Next.js, PostgreSQL, Tailwind, shadcn, auth hosted, checkout e dashboard de plano/uso via Infi.

## Billing as code

Product and meters live in [`infi.billing.ts`](infi.billing.ts) — the source of truth.

```bash
bun run plan    # dry-run (shows sync diff)
bun run setup   # apply billing + register identity app
# or with the CLI installed:
infi sync infi.billing.ts --plan
infi sync infi.billing.ts
```

## Setup

```bash
cp .env.example .env.local   # ou use create-infi-app que escreve automaticamente
docker compose up -d db
bun install
bun run db:push
bun run setup
bun run dev
```

Abra http://localhost:__PORT__

## Deploy (Vercel)

```bash
# After linking: vercel link
infi deploy --url https://my-app.vercel.app   # register webhook + write INFI_WEBHOOK_SECRET
# or full flow:
infi deploy vercel --prod                     # vercel deploy + env sync + webhook
```

Requires [Vercel CLI](https://vercel.com/docs/cli) for `deploy vercel`. Set `DATABASE_URL` in Vercel (Postgres addon or external).

## Claim do sandbox

Se `INFI_SANDBOX_CLAIM_URL` estiver no `.env.local`, a landing exibe um banner até você finalizar o claim no dashboard Infi.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `bun run dev` | Next.js dev server |
| `bun run setup` | Sync billing + registra app identity |
| `bun run db:push` | Aplica schema Prisma no Postgres |
