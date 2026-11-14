# SDK examples

One script per billing use case, written only with the SDK's public API (`infi.<tag>.<method>`, `paginate`, `InfiError`). They import the local package (`../src/index.js`).

## How to run

```sh
INFI_SECRET_KEY=sk_test_... bun examples/01-billing-as-code.ts
INFI_SECRET_KEY=sk_test_... bun examples/run-all.ts   # all of them, with ✓/✗ at the end
```

- `INFI_SECRET_KEY` (required): an `sk_test_` key from a sandbox account that has an owner. The anonymous account (`/public/v1/claimables`) was removed in ADR 0076. Examples 01 and 05 apply config documents to the account: use an account just for the examples. They were written for a clean account per run; running again on the same account has not been verified yet.
- `INFI_API_URL` (optional): without it, the SDK uses `https://api-sandbox.beinfi.com` for `sk_test_`. For the local backend, `INFI_API_URL=http://127.0.0.1:8088`.
- Types: `bun x tsc --noEmit` covers `examples/` together with the package.

## What each script shows

| Script | Demonstrates |
|---|---|
| `01-billing-as-code.ts` | A document with a subscription, a usage product and a prepaid product with a grant; plan, apply with `ifMatch: planHash`, pull; apply with a stale hash gives 412, without If-Match gives 428 |
| `02-one-time-link.ts` | One-time product: draft, preview with `draftHash`, link draft, publish (428 without If-Match) and the link URL |
| `03-subscription-link.ts` | Same flow for a monthly subscription, plus the 412 when the product changes after the preview |
| `04-usage-based.ts` | Usage product, customer by productKey, events with a repeated `eventId` counting once, consumption per meter |
| `05-prepaid-credits.ts` | Prepaid product declared in config, 1000 credited to the wallet, 200 consumed, and waiting for the worker to debit it (up to 3 min) |
| `06-customer-session.ts` | Portal session: create, verify, revoke and verify again (401) |
| `07-reconciliation.ts` | `paginate` sobre `customers.list` (25 customers, limit 10) e `payments.list` |
| `08-checkout-delivery-webhook.ts` | Sale to a buyer: published product, delivery by link, subscribed webhook, checkout with the hosted URL and the read that waits for the payment |

## Script to SDK operations

| Script | Operations |
|---|---|
| 01 | `config.plan`, `config.apply`, `config.pull` |
| 02 | `products.saveDraft`, `products.getDraft`, `links.saveDraft`, `links.publishDraft` |
| 03 | `products.saveDraft`, `products.getDraft`, `links.saveDraft`, `links.getDraft`, `links.publishDraft` |
| 04 | `products.saveDraft`, `products.publishDraft`, `config.pull`, `customers.create`, `usage.record`, `usage.get` |
| 05 | `config.plan`, `config.apply`, `config.pull`, `products.saveDraft`, `products.publishDraft`, `customers.create`, `customers.creditWallet`, `customers.getWallet`, `usage.record` |
| 06 | `products.saveDraft`, `products.publishDraft`, `customers.create`, `customerSessions.create`, `customerSessions.verify`, `customerSessions.revoke` |
| 07 | `products.saveDraft`, `products.publishDraft`, `customers.create`, `customers.list` and `payments.list` via `paginate` |
| 08 | `products.saveDraft`, `products.publishDraft`, `products.setDeliverable`, `products.getDeliverable`, `webhooks.subscribe`, `webhooks.list`, `checkouts.create`, `checkouts.get` |
