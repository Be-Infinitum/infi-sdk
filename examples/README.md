# Exemplos do SDK

Um script por caso de uso de cobrança, escrito só com a API pública do SDK (`infi.<tag>.<método>`, `paginate`, `InfiError`). Importam o pacote local (`../src/index.js`).

## Como rodar

```sh
INFI_SECRET_KEY=sk_test_... bun examples/01-billing-as-code.ts
INFI_SECRET_KEY=sk_test_... bun examples/run-all.ts   # todos, com ✓/✗ no fim
```

- `INFI_SECRET_KEY` (obrigatória): chave `sk_test_` de uma conta de sandbox com dono. A conta anônima (`/public/v1/claimables`) saiu na ADR 0076. O 01 e o 05 aplicam documentos de config na conta: use uma conta só para os exemplos. Eles foram escritos para uma conta limpa por execução; rodar de novo na mesma conta ainda não foi verificado.
- `INFI_API_URL` (opcional): sem ela, o SDK usa `https://api-sandbox.beinfi.com` para `sk_test_`. Para o backend local, `INFI_API_URL=http://127.0.0.1:8088`.
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
| `08-checkout-delivery-webhook.ts` | Venda para um comprador: produto publicado, entrega por link, webhook inscrito, checkout com a URL hospedada e a leitura que espera o pagamento |

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
| 08 | `products.saveDraft`, `products.publishDraft`, `products.setDeliverable`, `products.getDeliverable`, `webhooks.subscribe`, `webhooks.list`, `checkouts.create`, `checkouts.get` |
