# AI Agent Billing — end-to-end (sandbox)

**Company as code** → real AI calls → usage invoice → optional webhooks → go-live hint.

Everything through `@beinfi/sdk` (+ CLI helpers for claim/doctor/go-live):

1. Sync `infi.company.ts` (`defineCompany`)
2. Enroll a customer
3. Call OpenAI + Gemini; record tokens/requests (`infi.meter` + `session`)
4. `invoices.fromUsage` + email hosted pay link
5. Optional ngrok webhooks for `payment.confirmed`
6. Print `infi go-live` next steps (claim → KYC)

## Run

```bash
bun install   # from repo root: bun install && bun run build
cd examples/ai-agent-billing

OPENAI_API_KEY=sk-… \
GEMINI_API_KEY=… \
bun run start
```

If `INFI_SECRET_KEY` is unset, the script **claims a sandbox tenant**, writes `.env.local`,
and continues. Pass a key to reuse an existing tenant.

| Env | Required | Notes |
|-----|----------|-------|
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | one of | Real LLM calls |
| `INFI_SECRET_KEY` | no | Auto-claimed if missing |
| `NGROK_AUTHTOKEN` | no | Live webhook waits |
| `INFI_API_URL` | no | Local API override only |
| `CUSTOMER_EMAIL` | no | Default `demo@example.com` |

## Company config

See `infi.company.ts`. Apply with the script sync or:

```bash
infi sync infi.company.ts --plan
```

## Go-live

Sandbox charges are test-mode. For real money:

```bash
infi go-live --json
```

Agents: guide the human through claim → account → KYC — never invent `sk_live_`.

More detail: [`CLAUDE.md`](./CLAUDE.md).
