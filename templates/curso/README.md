# __APP_NAME__ — curso e área de membros com Infi

Venda um curso vitalício, por assinatura ou por prazo; os alunos entram numa
área de membros estilo Netflix com e-mail e código, continuam de onde pararam
em qualquer aparelho e recebem o convite do grupo quando pagam.

```bash
npm install
infi login              # escreve .env.local com o sk_test_ deste projeto
infi sync               # produtos, cupons e a loja (infi.company.ts)
npm run infi:seed       # a chave de acesso, o que cada produto libera e o curso de exemplo
npm run dev
```

- **Página de vendas:** `/` · **Área de membros:** `/membros` · **Minhas compras:** `/minhas-compras`
- **Editar o curso:** pela API — no painel do Infi, no CLI ou pedindo à sua IA
  pelo MCP do Infi ("crie a aula 4 com este link do Vimeo"). Sem deploy.
- **Vídeo:** fica no seu provedor (Vimeo, Panda, Bunny, YouTube). Restrinja o
  domínio: [GUIA-VIDEO.md](GUIA-VIDEO.md).
- **Grupo de alunos:** Telegram ou Discord, ligados à chave `curso` pela API
  (`infi.community.connectTelegram`).

Leia o [AGENTS.md](AGENTS.md) antes de pedir mudanças a uma IA.
