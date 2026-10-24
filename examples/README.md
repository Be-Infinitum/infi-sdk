# Exemplos do SDK

Um script por caso de uso de cobrança, escrito só com a API pública do SDK (`infi.<tag>.<método>`, `paginate`, `InfiError`). Importam o pacote local (`../src/index.js`).

## Como rodar

```sh
cd sdk/typescript
bun examples/01-billing-as-code.ts
bun examples/run-all.ts   # todos, com ✓/✗ no fim
```

- `INFI_SECRET_KEY` (opcional): usa essa chave. Sem ela, `_setup.ts` cria uma conta de teste nova em `POST {INFI_API_URL}/public/v1/claimables` (único `fetch` direto), então cada script roda sozinho numa conta limpa.
- `INFI_API_URL` (padrão `https://api-sandbox.beinfi.com`): qualquer backend em modo sandbox com worker; para um backend local, `INFI_API_URL=http://127.0.0.1:8088`.
- Tipos: `bun x tsc --noEmit` cobre `examples/` junto com o pacote.

## O que cada script mostra

| Script | Demonstra |
|---|---|
| `01-billing-as-code.ts` | Documento com assinatura, produto por uso e pré-pago com grant; plan, apply com `ifMatch: planHash`, pull; apply com hash velho dá 412, sem If-Match dá 428 |
| `02-one-time-link.ts` | Produto avulso: rascunho, prévia com `draftHash`, rascunho de link, publicar (428 sem If-Match) e a URL do link |
| `03-subscription-link.ts` | Mesmo fluxo para assinatura mensal, mais o 412 quando o produto muda depois da prévia |
| `04-usage-based.ts` | Produto por uso, cliente por productKey, eventos com `eventId` repetido contando uma vez, consumo por meter |
| `05-prepaid-credits.ts` | Pré-pago declarado em config, crédito de 1000 na carteira, consumo de 200 e espera do débito pelo worker (até 3 min) |
| `06-customer-session.ts` | Sessão de portal: criar, verificar, revogar e verificar de novo (401) |
| `07-reconciliation.ts` | `paginate` sobre `customers.list` (25 clientes, limit 10) e `payments.list` |

## Script para operações do SDK

| Script | Operações |
|---|---|
| 01 | `config.plan`, `config.apply`, `config.pull` |
| 02 | `products.saveDraft`, `products.getDraft`, `links.saveDraft`, `links.publishDraft` |
| 03 | `products.saveDraft`, `products.getDraft`, `links.saveDraft`, `links.getDraft`, `links.publishDraft` |
| 04 | `products.saveDraft`, `products.publishDraft`, `config.pull`, `customers.create`, `usage.record`, `usage.get` |
| 05 | `config.plan`, `config.apply`, `config.pull`, `products.saveDraft`, `products.publishDraft`, `customers.create`, `customers.creditWallet`, `customers.getWallet`, `usage.record` |
| 06 | `products.saveDraft`, `products.publishDraft`, `customers.create`, `customerSessions.create`, `customerSessions.verify`, `customerSessions.revoke` |
| 07 | `products.saveDraft`, `products.publishDraft`, `customers.create`, `customers.list` e `payments.list` via `paginate` |
