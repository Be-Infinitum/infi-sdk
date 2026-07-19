# AI Agent Billing — end-to-end (sandbox)

Everything through `@beinfi/sdk`: declare a product + meters, enroll a customer,
make **real** AI calls (OpenAI + Gemini), record token usage, roll it into an
invoice with `invoices.fromUsage`, email it, and wait for the customer to pay
(`payment.confirmed` webhook, verified with `verifyWebhook`).

## Run

```bash
bun install
INFI_SECRET_KEY=sk_test_… \
OPENAI_API_KEY=sk-… \
GEMINI_API_KEY=… \
bun run index.ts
```

Company config lives in `infi.company.ts` (`defineCompany`). Optional:
`INFI_API_URL` (local only), `NGROK_AUTHTOKEN` (live webhooks).

The customer pays via the emailed hosted-checkout link; the `payment.confirmed`
webhook closes the flow when ngrok is set.
