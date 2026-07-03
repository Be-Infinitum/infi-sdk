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

## Metered-LLM surface adoption (DevEx)

Adopting `infi.meter(...)` + `UsagePanel` into this Vite SPA + Hono + AI SDK app,
using only the public surface (README, exported `.d.ts`/JSDoc, existing example code).

### Per-step effort (1 trivial → 5 painful)

| Step | Effort | Notes |
| --- | --- | --- |
| Learn `meter` from README + `.d.ts` | 2 | README example + `MeterOptions` JSDoc are clear for a **resolved** LLM call. Nothing says how it behaves with a streamed response. |
| Wire the pre-flight gate + `InsufficientCreditError` → 402 | 1 | Genuinely a drop-in: wrap the call, `catch (err instanceof InsufficientCreditError)` → 402, read `err.balance`. Deleted the manual `balance <= 0` pre-check. |
| Make `meter` record streamed token usage | 5 | Does **not** work. meter records from `fn`'s resolved value the instant it resolves; `streamText` resolves to a stream handle whose `usage` is an unresolved `Promise`. Had to neutralize meter's recording (`value: 1`) and keep the real deduction in `onFinish`. |
| Swap balance pill → `UsagePanel` via `customers.state` | 2 | Added `GET /api/state` → `infi.customers.state(id)`; client fetches JSON and renders `<UsagePanel state={...} />`. Component is presentational (no hooks/fetch) so it drops into the client tree fine. |
| Typecheck (`npx tsc --noEmit`) | 1 | Passes. |

### Friction (each with the one-liner SDK fix)

1. **`meter` does not compose with streaming LLM calls (HIGH).** AI SDK `streamText`
   returns synchronously with `usage: Promise<{ totalTokens, promptTokens, completionTokens }>`.
   meter awaits `fn` (resolves immediately, before any token is generated) and then records
   usage from that value — so its built-in OpenAI/Anthropic detection sees a stream handle,
   not a usage object, and there is no point at which the real token count is available to it
   without draining the stream server-side (which kills client streaming).
   *Fix:* accept a `Promise`/thenable usage source, e.g. `meter(opts, fn, { usage: () => Promise<number> })`,
   or document `meter` as non-streaming-only and ship a streaming variant (`meterStream`) that
   records from the AI SDK's `onFinish`/`result.usage`.

2. **No gate-only mode; `meter` always records (HIGH, root of #1).** There is `skipGuard`
   (skip the check, still record) but no `skipRecord` (check only). For streaming you want
   *gate now, record later* — impossible today, so I passed a placeholder `value: 1` (pollutes
   the tokens meter by 1/turn) and did the real `credits.consume` in `onFinish`.
   *Fix:* add `skipRecord?: boolean` (or return a `settle(value)` handle from the gate).

3. **Built-in extractor targets raw provider shapes, not AI-SDK-normalized usage (MED).**
   Detection reads `total_tokens` / `input_tokens + output_tokens`; the AI SDK exposes
   `totalTokens` (camelCase). Even with a non-streamed `generateText`, auto-detection misses,
   forcing a custom `extract`.
   *Fix:* also detect the AI SDK shape (`totalTokens` / `promptTokens + completionTokens`).

4. **Which id does `meter`/`state` want? (MED — same id ambiguity as before).**
   `MeterOptions.customerId` and `customers.state(customerId)` are named "customerId", but in
   this app credits live on the **enrollment** id (`ProductCustomer.id`). I passed `enrollmentId`
   (consistent with `credits.balance`) and it lines up, but the naming actively suggests the
   wrong id.
   *Fix:* rename to `enrollmentId` (or document "the id `credits.*` uses") across `meter`/`state`.

5. **`UsagePanel` state must round-trip through your own endpoint (LOW).** README says fetch
   `customers.state` server-side (secret key) and pass it in — correct, but in a non-Next SPA
   that means hand-adding a `GET /api/state` proxy. Fine, but it's boilerplate every non-Next
   app repeats.
   *Fix:* a tiny framework-agnostic `stateHandler(infi)` (like the mooted `@beinfi/hono`) that
   returns the JSON, mirroring the Next `Usage` route handler.

6. **`UsagePanel` is unstyled on a dark theme (LOW).** "Unstyled beyond minimal layout" means it
   renders plain on this black UI; `classNames` overrides exist but there's no dark preset.
   *Fix:* ship a `theme="dark"` preset or CSS variables so it inherits the host palette.

### Resolved

Friction #1 (`meter` doesn't compose with streaming) and #2 (no gate-only mode) are **fixed**
by the new `mode: "streaming"`. The `/api/chat` handler now calls
`infi.meter({ customerId, meter: "tokens", mode: "streaming" }, () => streamText(...))`:
meter **gates** on wallet balance (throws `InsufficientCreditError` → 402 when empty) but
**records nothing**, then the real token count is deducted exactly once in the AI SDK
`onFinish` (`credits.consume`). Gate-now, record-later — no more bogus `value: 1` polluting
the tokens meter, no double-write. The `InsufficientCreditError` → 402 handling is unchanged.
