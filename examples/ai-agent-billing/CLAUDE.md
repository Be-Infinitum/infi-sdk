# AI agent billing — agent runbook

End-to-end **usage → invoice** demo on `@beinfi/sdk` (sandbox). Declares the company
in `infi.company.ts`, runs real OpenAI + Gemini calls, records tokens/requests, rolls
usage into an invoice, optionally waits on webhooks, then prints **go-live** guidance.

## Setup

1. From repo root: `bun install && bun run build`
2. `cd examples/ai-agent-billing`
3. LLM keys (at least one provider):
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`
4. Run: `bun run start`

**No `INFI_SECRET_KEY`?** The script claims a sandbox tenant, writes `.env.local`, then
syncs `infi.company.ts`. Equivalent CLI: `infi claim create --ref cli --json`.

Optional:

- `INFI_SECRET_KEY` — reuse an existing sandbox key
- `INFI_API_URL` — local API only (`http://localhost:8088`)
- `NGROK_AUTHTOKEN` — live `invoice.finalized` / `payment.confirmed` waits
- `CUSTOMER_EMAIL` — invoice recipient (default `demo@example.com`)

## Flow (do not reorder)

1. **Bootstrap** (if no key) → claimable tenant  
2. **`infi.sync(infi.company.ts)`** → product `ai-agent-pro` + meters  
3. **`infi doctor`** — must pass before AI calls  
4. **Enroll** customer  
5. **AI usage** — one call via `infi.meter({ mode: "postpaid" })`, rest via `session().track`  
6. **`invoices.fromUsage`** → email pay link  
7. **Webhooks** (optional ngrok)  
8. **`infi go-live` status** — claim → account → KYC hint (never invents `sk_live_`)

## Company as code

Edit `infi.company.ts` (`defineCompany`). Re-run the script (sync is idempotent).

## Gotchas

- Metering ingest needs **productId** on events — this demo passes it via `session` / `meter`.
- `mode: "postpaid"` records usage without a prepaid credit gate (this product is usage-rated).
- Hosted auth/pay URLs are inferred from the key — do not set `INFI_AUTH_BASE_URL`.
