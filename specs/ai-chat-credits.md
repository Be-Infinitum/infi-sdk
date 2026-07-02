# Spec — Example: AI Chat on prepaid credits

**Status:** Implemented (`examples/ai-chat/`, Vite + Hono + AI SDK, `@beinfi/sdk@0.6.0`).
Added the `credits.consume` + `products.enroll` primitives it needed. Pending: convert to a
standalone turborepo starter on the **published** SDK (see below).

## Goal

An AI chat app where usage burns **prepaid credits**. User logs in, buys a credit
pack, chats (each turn consumes credits via metered usage), and when the balance
hits zero we show a "buy more" banner and they top up. Second goal (as with the CRM):
surface what the SDK must add to make this easy — dev-first / agentic-first.

## Stack

- **Vite + React** SPA + a thin server (Hono or a Vite server route) — needed because
  the AI provider key and the Infi secret key must stay server-side.
- **AI SDK** (Vercel `ai`) with a Claude provider; `streamText` on the server,
  `useChat` on the client (streaming, tool calls later).
- **shadcn AI Elements** for the conversation layer: `Conversation`, `Message`,
  message bubbles, streaming/auto-scroll, attachments, markers, `PromptInput`.
- **`@beinfi/sdk`** for auth (email-code / hosted) and metering.

## Domain / billing model

- One **product** `ai-chat` with a **prepaid_credits** price and a meter `tokens`
  (aggregation `sum`). Credit packs sold as one-time products (e.g. "10k credits").
- Balance is the customer's credit ledger. Each chat turn `track({ meter: "tokens",
  value })` posts a `consumption` entry; the ledger balance drops.

## Infi integration — capability vs today

| Need | Backend | SDK today |
| --- | --- | --- |
| Login (email code / hosted) | `/identity/*` | ✅ `sendEmailCode`/`verifyEmailCode`/`exchangeCode`, `getSession` |
| Meter chat tokens | `POST /metering/events` | ✅ `infi.track` |
| **Read credit balance** (for the banner) | `GET /metering/customers/{id}/credit` | ❌ **gap** — no `infi.credits.balance()` |
| **Buy a credit pack** (self-serve) | invoice + hosted checkout `/pay/{slug}/invoices/{id}` | ❌ **gap** — no `infi.checkout(...)`; also no self-serve "purchase credits" endpoint (credits are *granted*, or fulfilled on `payment.confirmed`) |
| Grant credits after payment | `POST /metering/customers/{id}/credit` + webhook `payment.confirmed` | ❌ SDK exposes neither credit grant nor webhook verification |
| Seed product/price/meter | catalog endpoints (see billing-as-code) | ❌ not in SDK |

## Key flows

1. **Login** → `getSession()` resolves the customer.
2. **Show balance** — read credit balance; render remaining credits in the header.
3. **Chat turn** — client `useChat` → server `/api/chat`: check balance > 0 (else 402 +
   banner), `streamText` from Claude, on finish `infi.track({ customerId, meter:"tokens",
   value: usage.totalTokens })`.
4. **Out of credit** — balance 0 → disable input, show "Comprar créditos" banner.
5. **Buy credits** — create an invoice for the pack → redirect to hosted checkout
   (`/pay/{slug}/invoices/{id}`) → pay (pix/card) → `payment.confirmed` webhook →
   grant credits → balance refreshes.

## SDK gaps to fix (findings to validate while building)

1. **`infi.credits.balance(customerId)` / `getSession()` returning balance** — the banner
   needs it on every load. Highest-value add for this example.
2. **A client-safe balance read** (publishable key) so the SPA can show balance without a
   server round-trip, OR a documented server proxy pattern.
3. **`infi.checkout({ product | lineItems })`** returning a hosted-checkout URL — buying
   anything today is a multi-call invoice+charge dance not in the SDK.
4. **Self-serve "buy credits"** primitive (credit pack product → checkout → auto-grant),
   so integrators don't hand-wire invoice + webhook + grant.
5. **Webhook verification helper** for `payment.confirmed` (to grant credits safely).

## Verification

Login → balance shows → chat streams and decrements → hit zero → banner → buy pack →
webhook grants → balance restored → chat works again. Note every step that needed a raw
REST call instead of an SDK method (that's the finding).

## Open questions

- Model choice fixed (Claude) or user-selectable? Attachments metered separately?
- Credit unit = tokens 1:1, or an abstract credit with a token→credit rate?
