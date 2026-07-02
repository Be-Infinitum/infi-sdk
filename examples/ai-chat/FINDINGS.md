# AI chat on prepaid credits — DX report

Third example, first **non-Next.js** stack (Vite SPA + Hono server + AI SDK). Prepaid
credits (credits = tokens): login → starter credits → chat burns credits → out-of-credit
banner → buy a pack → balance refreshes. Same lens: dev-first / agentic-first.

## Verdict: **8.5 / 10** — needed two new primitives, then smooth

Two real gaps blocked "credits" from working at all; we shipped both, and the rest was
one-liners.

| Step | Effort (1 trivial → 5 painful) | Notes |
| --- | --- | --- |
| Seed product + meter + price | 1 | `infi.sync(defineBilling(...))` |
| Login (Vite + Hono, no @beinfi/nextjs) | 3 | Hand-wired `buildHostedLoginUrl` + `exchangeCodeFromRequest` + `getSession` + cookie in Hono. Works, but the only auth *adapter* is Next-only. |
| Read balance | 1 | `infi.customers.credits.balance(enrollmentId)` |
| Deduct per message | 1 (**after fix**) | `infi.customers.credits.consume(...)` in `streamText.onFinish` |
| Buy pack → grant | 1 | `checkout({ productId, customer })` → `payment.confirmed` webhook → `credits.grant` |
| AI streaming | 1 | AI SDK `streamText` (Hono) + `useChat` (client) |

## Findings

1. **✅ FIXED — credits were never consumable.** `track()` records usage but inserts no
   `consumption` ledger entry (the kind existed, unused), so balance could only go up. Added
   backend `POST /metering/customers/{id}/credit/consume` (rejects overdraw) + SDK
   `infi.customers.credits.consume`. Now `onFinish` deducts real token counts and the balance
   drops in real time — the whole demo hinges on this.
2. **✅ FIXED — no enroll in the SDK.** Credits live on the **enrollment** (`product_customers.id`),
   not the tenant customer id from `getSession`. Added `infi.products.enroll(productId, {...})`
   (wraps the existing endpoint) → returns the wallet id used by `credits.*`. Non-obvious id
   relationship; worth calling out in docs.
3. **⚠️ Auth is Next-only.** `@beinfi/nextjs` has the nice `Login`/`Callback`/`getSession`
   handlers; on Vite+Hono I re-implemented them from SDK core (fine, ~30 lines). **Fix:** a
   framework-agnostic auth helper (or `@beinfi/hono`) so non-Next apps aren't hand-wiring cookies.
4. **No auto-grant on payment for prepaid** — kept explicit (webhook → `credits.grant`), which
   is clear enough. A "credit pack product" concept (buy → auto-grant N credits) would remove the
   webhook glue.
5. Consuming after streaming means a turn can end slightly past zero (we gate on `balance > 0`
   before, deduct actual tokens after). Fine for a demo; a reserve/settle pattern would be exact.

## What was easy (keep)
- `sync`, `checkout({ productId })`, `verifyWebhook`, `credits.balance/grant/consume` — all
  one-liners once the two primitives existed.
- The SDK core (`buildHostedLoginUrl`, `exchangeCodeFromRequest`, `getSession`) worked cleanly
  outside Next.js — the auth gap is ergonomics, not capability.
