# __APP_NAME__

Fullstack starter gerado com [create-beinfi-app](https://github.com/beinfi/infi-sdk): Next.js, PostgreSQL, Tailwind, shadcn, auth hosted, checkout e dashboard de plano/uso via Infi.

## Setup

```bash
cp .env.example .env.local   # ou use create-beinfi-app que escreve automaticamente
docker compose up -d db
bun install
bun run db:push
bun run setup
bun run dev
```

Abra http://localhost:__PORT__

## Claim do sandbox

Se `INFI_SANDBOX_CLAIM_URL` estiver no `.env.local`, a landing exibe um banner até você finalizar o claim no dashboard Infi.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `bun run dev` | Next.js dev server |
| `bun run setup` | Sync billing + registra app identity |
| `bun run db:push` | Aplica schema Prisma no Postgres |
