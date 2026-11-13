# @beinfi/sdk

SDK TypeScript da Infi, gerado do contrato da API pública (`api/openapi.sdk.json`, cópia do `backend/api/openapi.sdk.json` do monorepo; ADR 0055).

O contrato chega sozinho: quando `backend/api/openapi.sdk.*` muda na `main` do monorepo, o workflow `infi-sdk: sync contract` de lá copia o contrato, roda `bun run codegen` e abre um PR aqui (`chore/sync-contract`). À mão, com o monorepo ao lado: `INFI_BACKEND=<caminho>/backend bun run sync:contract`.

```sh
bun add @beinfi/sdk   # ou npm i @beinfi/sdk
```

```ts
import { Infi, paginate, verifyWebhook } from "@beinfi/sdk";
const infi = new Infi({ secretKey: process.env.INFI_SECRET_KEY! }); // sk_test_ -> sandbox, sk_live_ -> produção
```

- payments: `await infi.payments.list({ query: { status: "confirmed" } })`; `infi.payments.get({ path: { paymentId } })`
- usage: `await infi.usage.record({ body: { customerId, meter, value: 1 } })`; `infi.usage.get({ query: { customerId } })`
- customers: `await infi.customers.getWallet({ path: { customerId } })`; `infi.customers.creditWallet(...)`
- customerSessions: `await infi.customerSessions.create({ body: { customerId } })`
- products: `const { data } = await infi.products.saveDraft({ path: { draftKey }, body })` e `infi.products.publishDraft(...)`
- links: `await infi.links.publishDraft({ path: { draftKey } }, { ifMatch: draftHash })`
- checkouts: `const c = await infi.checkouts.create({ body: { productId, customer: { externalId } } })` — mande o comprador para `c.url`; `infi.checkouts.get({ path: { checkoutId: c.id } })` lê `status` e os pagamentos
- webhooks: `await infi.webhooks.subscribe({ body: { url, events: ["payment.confirmed"] } })` (no live devolve `approvalUrl`); `infi.webhooks.list()`
- entrega: `infi.products.setDeliverable({ path: { productId }, body: { kind: "link", url } })`
- config: `const plan = await infi.config.plan({ body: { document } })` e `infi.config.apply({ body }, { ifMatch: plan.planHash })`

Listagens paginam por cursor: `for await (const p of paginate((q) => infi.payments.list(q), { query: { limit: 50 } })) {}`.
Webhooks: `verifyWebhook({ id, timestamp, signature, body }, secret)` com os headers `X-Webhook-Id`, `X-Webhook-Timestamp`, `X-Webhook-Signature` e o corpo cru.

## Idempotência e If-Match

- Toda mutação (POST/PUT/PATCH/DELETE) leva `Idempotency-Key`. Se você não passar `{ idempotencyKey }`, o SDK gera um uuid e reusa a mesma chave nos retries (erro de rede, 429, 5xx; até 3 tentativas). 4xx nunca é repetido.
- Publicar e aplicar exigem `{ ifMatch }` (o hash da prévia ou do plano). Se o estado mudou, o servidor responde 412 e `InfiError.current` traz o estado atual para reapresentar a prévia.
- Opção `{ channel: "panel" | "mcp" | "cli" | "api" }` envia `X-Infi-Channel`.
- Erros viram `InfiError` (`status`, `code`, `message`, `tracerId`, `details`, `body`).

## Este pacote é gerado

Edite o contrato (no monorepo), não o código. `bun run codegen` regenera `src/generated/`. À mão ficam só `http.ts`, `paginate.ts`, `webhooks.ts` e `index.ts`.

O CI (`.github/workflows/ci.yml`) falha se:

- `bun run check:generated` mudar algo em `src/generated/` (o gerado não bate com `api/openapi.sdk.json`);
- tipos, testes ou build quebrarem;
- algum exemplo de `examples/` falhar contra `api-sandbox.beinfi.com`, com a chave do secret `INFI_SANDBOX_SECRET_KEY`. Os testes de `src/` só cobrem o transporte; a prova de que o SDK fala com a API são os exemplos.

Publicar é à mão: workflow `publish`, escolhendo a dist-tag (`next` ou `latest`). Ele refaz as checagens, roda os exemplos e publica por trusted publishing do npm, sem token.
