# Proteger os vídeos do curso no seu provedor

O Infi não hospeda vídeo: cada aula guarda o link do vídeo no seu provedor. O
link só sai da API do Infi para quem tem acesso à aula (a página da aula é
renderizada no servidor, depois dessa checagem). Mas quem recebeu o link pode
tentar incorporá-lo em outro site. Para impedir isso, restrinja no provedor os
domínios que podem tocar o vídeo ao domínio do seu site.

Coloque na lista o domínio exato onde a área de membros roda (com e sem `www.`
se usar os dois) e, enquanto desenvolve, `localhost`.

## Vimeo

Na página de configurações do vídeo, em **Compartilhar** → **Onde pode ser
incorporado?**, escolha **Domínios específicos** e adicione seus domínios (até
50). Sites fora da lista recebem um erro no lugar do vídeo. Deixe o vídeo como
não listado para ele não aparecer no vimeo.com.

Fonte: [Vimeo — How do I set up domain-level privacy?](https://help.vimeo.com/hc/en-us/articles/30030693052305-How-do-I-set-up-domain-level-privacy)

## Panda Video

Em **Segurança** → **Domínios permitidos**, ative **Somente permitir os
domínios selecionados**, clique em **Adicionar domínios** e inclua os do seu
site. Com a verificação de domínio ligada, o player não toca fora deles, mesmo
com o link direto.

Fontes: [Recursos de segurança](https://help.pandavideo.com/pt-br/article/recursos-de-seguranca-disponiveis-na-panda-video-z2qx2u/),
[Verificação de domínio](https://help.pandavideo.com/pt-br/article/entenda-a-funcionalidade-de-ativardesativar-verificacao-de-dominio-1szfp67/)

## Bunny Stream

No painel, **Stream** → sua biblioteca → **Security**, preencha **Allowed
Domains** sem esquema (`seusite.com`, `www.seusite.com`, nunca
`https://seusite.com`): a entrada precisa bater exatamente com o domínio que
incorpora. Para ir além, a **Embed view token authentication** assina o link
do iframe com validade; ela exige que o seu servidor gere o token por aula
(não vem pronta neste template).

Fontes: [Bunny — Security](https://bunny.net/docs/stream/security),
[Embed view token authentication](https://docs.bunny.net/docs/stream-embed-token-authentication)

## YouTube

O YouTube **não** permite restringir a incorporação a domínios. Um vídeo não
listado não aparece em buscas, mas quem tem o link toca em qualquer lugar. Use
YouTube para aulas abertas ou de amostra; para o conteúdo pago, prefira um dos
provedores acima.
