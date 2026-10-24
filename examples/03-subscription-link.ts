// Assinatura mensal: mesmo fluxo de rascunho -> prévia -> publicar.
import { expectError, setup, show, step } from "./_setup.js";

const infi = await setup();

step("Salvar o rascunho da assinatura mensal");
const productKey = crypto.randomUUID();
const saved = await infi.products.saveDraft({
  path: { draftKey: productKey },
  body: { name: "Clube mensal", description: "Conteúdo novo todo mês", pricingModel: "subscription", currency: "BRL", basePrice: "29.90", billingCycle: "monthly" },
});
show("draftHash", saved.draftHash);

step("Ler a prévia do produto com ?hash=");
const preview = await infi.products.getDraft({ path: { draftKey: productKey }, query: { hash: saved.draftHash } });
show("oferta", `${preview.offer.name} — ${preview.offer.basePrice} ${preview.offer.currency}/${preview.offer.billingCycle}`);

step("Salvar o rascunho do link");
const linkKey = crypto.randomUUID();
const link = await infi.links.saveDraft({
  path: { draftKey: linkKey },
  body: { product: { draftKey: productKey }, successUrl: "https://example.com/bem-vindo", cancelUrl: "https://example.com/volta" },
});
show("prévia do link", link.preview);

step("Editar o produto depois da prévia invalida o hash do link (412)");
const edited = await infi.products.saveDraft(
  {
    path: { draftKey: productKey },
    body: { name: "Clube mensal", description: "Conteúdo novo todo mês + comunidade", pricingModel: "subscription", currency: "BRL", basePrice: "29.90", billingCycle: "monthly" },
  },
  { ifMatch: saved.draftHash },
);
show("novo draftHash do produto", edited.draftHash);
const stale = await expectError(412, () => infi.links.publishDraft({ path: { draftKey: linkKey } }, { ifMatch: link.draftHash }));
show("InfiError", `status=${stale.status} code=${stale.code}`);

step("Reler a prévia do link (hash novo) e publicar");
const fresh = await infi.links.getDraft({ path: { draftKey: linkKey } });
const published = await infi.links.publishDraft({ path: { draftKey: linkKey } }, { ifMatch: fresh.draftHash });
show("URL do link", published.link?.url ?? "(sem url)");
if (!published.published || !published.link?.url) throw new Error("link não saiu publicado com url");
