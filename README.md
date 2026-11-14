# @beinfi/sdk

Infi TypeScript SDK, generated from the public API contract (`api/openapi.sdk.json`, a copy of the monorepo's `backend/api/openapi.sdk.json`; ADR 0055).

The contract arrives on its own: when `backend/api/openapi.sdk.*` changes on the monorepo's `main`, the `infi-sdk: sync contract` workflow there copies the contract, runs `bun run codegen` and opens a PR here (`chore/sync-contract`). By hand, with the monorepo next to this repo: `INFI_BACKEND=<caminho>/backend bun run sync:contract`.

```sh
bun add @beinfi/sdk   # or npm i @beinfi/sdk
```

```ts
import { Infi, paginate, verifyWebhook } from "@beinfi/sdk";
const infi = new Infi({ secretKey: process.env.INFI_SECRET_KEY! }); // sk_test_ -> sandbox, sk_live_ -> production
```

- payments: `await infi.payments.list({ query: { status: "confirmed" } })`; `infi.payments.get({ path: { paymentId } })`
- usage: `await infi.usage.record({ body: { customerId, meter, value: 1 } })`; `infi.usage.get({ query: { customerId } })`
- customers: `await infi.customers.getWallet({ path: { customerId } })`; `infi.customers.creditWallet(...)`
- customerSessions: `await infi.customerSessions.create({ body: { customerId } })`
- products: `const { data } = await infi.products.saveDraft({ path: { draftKey }, body })` e `infi.products.publishDraft(...)`
- links: `await infi.links.publishDraft({ path: { draftKey } }, { ifMatch: draftHash })`
- checkouts: `const c = await infi.checkouts.create({ body: { productId, customer: { externalId } } })` — send the buyer to `c.url`; `infi.checkouts.get({ path: { checkoutId: c.id } })` reads `status` and the payments
- webhooks: `await infi.webhooks.subscribe({ body: { url, events: ["payment.confirmed"] } })` (in live it returns `approvalUrl`); `infi.webhooks.list()`
- delivery: `infi.products.setDeliverable({ path: { productId }, body: { kind: "link", url } })`
- config: `const plan = await infi.config.plan({ body: { document } })` e `infi.config.apply({ body }, { ifMatch: plan.planHash })`

Lists paginate by cursor: `for await (const p of paginate((q) => infi.payments.list(q), { query: { limit: 50 } })) {}`.
Webhooks: `verifyWebhook({ id, timestamp, signature, body }, secret)` with the `X-Webhook-Id`, `X-Webhook-Timestamp` and `X-Webhook-Signature` headers and the raw body.

## Idempotency and If-Match

- Every mutation (POST/PUT/PATCH/DELETE) carries an `Idempotency-Key`. If you don't pass `{ idempotencyKey }`, the SDK generates a uuid and reuses the same key on retries (network error, 429, 5xx; up to 3 attempts). Other 4xx responses are never retried.
- Publish and apply require `{ ifMatch }` (the preview or plan hash). If the state changed, the server answers 412 and `InfiError.current` carries the current state so you can show the preview again.
- Option `{ channel: "panel" | "mcp" | "cli" | "api" }` sends `X-Infi-Channel`.
- Errors become `InfiError` (`status`, `code`, `message`, `tracerId`, `details`, `body`).

## This package is generated

Edit the contract (in the monorepo), not the code. `bun run codegen` regenerates `src/generated/`. Only `http.ts`, `paginate.ts`, `webhooks.ts` and `index.ts` are handwritten.

CI (`.github/workflows/ci.yml`) fails if:

- `bun run check:generated` changes anything in `src/generated/` (the generated code doesn't match `api/openapi.sdk.json`);
- types, tests or the build break;
- any example in `examples/` fails against `api-sandbox.beinfi.com`, using the key from the `INFI_SANDBOX_SECRET_KEY` secret. Each SDK repo uses its own sandbox account: the four CIs run at the same time, and on a shared account they race on its config (412 `plan_changed`) and on its rate limit (429). The tests in `src/` only cover the transport; the proof that the SDK talks to the API is the examples.

Publishing is manual: the `publish` workflow, choosing the dist-tag (`next` or `latest`). It reruns the checks, runs the examples and publishes through npm trusted publishing, with no token.
