# Exemplo

```bash
cd packages/checkout
npm run build
python3 -m http.server 5173
# http://localhost:5173/examples/
```

`localhost:5173` é uma origem que a Infi nunca poderia ter colocado numa
allowlist — é exatamente o que o exemplo prova. Se o checkout carrega e o pix
confirma daqui, carrega de qualquer domínio de merchant.

Precisa de um payment link. Todo produto publicado já tem um:

```ts
const links = await infi.links.list(productId, { slug });
console.log(links[0].token); // plink_…
```

Para levar um pix a pago sem credencial de provider, abra o QR em sandbox: ele
aponta para uma página de confirmação nossa. Aprove lá e **não toque nesta aba** —
o poll do próprio embed vira o recibo. Isso é o teste de verdade; se você precisar
dar refresh, algo está errado.

O log mostra cada mensagem do protocolo. Duas coisas para observar:

- **A altura acompanha o conteúdo nos dois sentidos.** `resize` deve diminuir
  quando o painel encolhe, não só crescer.
- **`complete` não é prova de pagamento.** Está rotulado assim no log de
  propósito. É um evento de cliente numa página que o merchant controla; quem
  libera a entrega é o webhook `payment.confirmed`.
