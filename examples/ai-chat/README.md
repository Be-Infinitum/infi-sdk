# AI Chat — Infi prepaid credits

An AI chat where each turn burns **prepaid credits** (credits = tokens, 1:1). Login → starter
credits → chat streams and deducts → out-of-credit banner → buy a pack → balance refreshes.
First **non-Next.js** example: Vite SPA + Hono server + AI SDK, on `@beinfi/sdk`.

Stack: Vite + React + Tailwind v4 · Hono (`@hono/node-server`) · AI SDK (`ai` + `@ai-sdk/anthropic`) ·
Prisma (SQLite) for the wallet/purchase maps.

## Run

```bash
cd ../.. && bun install && bun run build   # build the packages once
cd examples/ai-chat
cp .env.example .env      # fill ANTHROPIC_API_KEY, INFI_SECRET_KEY, INFI_SLUG, INFI_WEBHOOK_SECRET
bunx prisma db push
bun run seed              # sync the ai-chat product (prepaid + tokens meter) via infi.sync
bun run dev               # web on :5173, API on :3012
```

## How it works

- **Auth** (SDK core, no `@beinfi/nextjs`): `/api/auth/login` → `buildHostedLoginUrl`; `/callback`
  → `exchangeCodeFromRequest` → `infi_session` cookie; a Hono middleware resolves the session via
  `infi.getSession`, and on first login **enrolls** the customer in the `ai-chat` product
  (`infi.products.enroll`) + grants starter credits.
- **Chat**: `useChat` → `/api/chat` gates on `credits.balance > 0`, streams from Claude, and on
  finish **deducts** the token count via `infi.customers.credits.consume` (+ `infi.track`).
- **Buy**: `infi.checkout({ productId, customer })` → hosted pay → `payment.confirmed` webhook
  (`infi.verifyWebhook`) → `infi.customers.credits.grant`.

Prereqs for real auth/payments: backend at `INFI_API_URL`, a claimed sandbox (`sk_test_` + slug),
your origin allowlisted, `ANTHROPIC_API_KEY`. See **FINDINGS.md** for the DX report.
