# __APP_NAME__ — loja digital com Infi

Loja, checkout pix e cartão, entrega digital, assinatura mensal e "Minhas
compras" — o template Ecommerce do Infi.

```bash
infi login        # entra (ou cria a conta) no navegador; escreve .env.local
infi sync         # semeia o catálogo, a loja, os cupons e o arquivo no seu sandbox
npm run dev       # http://localhost:__PORT__
```

Edite com a sua IA: o [AGENTS.md](AGENTS.md) diz o que ela nunca deve mudar.
Webhook local: exponha a porta com um túnel (cloudflared/ngrok) e rode
`infi deploy --url <https do túnel>`.
