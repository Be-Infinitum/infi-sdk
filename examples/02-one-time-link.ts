// Produto avulso: rascunho de produto -> prévia -> rascunho de link -> publicar com If-Match.
import { expectError, setup, show, step } from "./_setup.js";

const infi = await setup();

step("Salvar o rascunho do produto avulso");
const productKey = crypto.randomUUID();
const saved = await infi.products.saveDraft({
  path: { draftKey: productKey },
  body: { name: "Mentoria de 1h", description: "Uma sessão individual", pricingModel: "one_time", currency: "BRL", basePrice: "150.00" },
});
show("draftHash", saved.draftHash);

step("Ler a prévia do produto com ?hash=");
const preview = await infi.products.getDraft({ path: { draftKey: productKey }, query: { hash: saved.draftHash } });
show("oferta", `${preview.offer.name} — ${preview.offer.basePrice} ${preview.offer.currency}`);
show("published", preview.published);

step("Salvar o rascunho do link apontando para o rascunho do produto");
const linkKey = crypto.randomUUID();
const link = await infi.links.saveDraft({
  path: { draftKey: linkKey },
  body: { product: { draftKey: productKey }, successUrl: "https://example.com/obrigado" },
});
show("prévia do link", link.preview);
show("draftHash do link", link.draftHash);

step("Publicar o link sem If-Match deve dar 428");
const e428 = await expectError(428, () => infi.links.publishDraft({ path: { draftKey: linkKey } }));
show("InfiError", `status=${e428.status} code=${e428.code}`);

step("Publicar o link com If-Match = draftHash");
const published = await infi.links.publishDraft({ path: { draftKey: linkKey } }, { ifMatch: link.draftHash });
show("published", published.published);
show("URL do link", published.link?.url ?? "(sem url)");
if (!published.published || !published.link?.url) throw new Error("link não saiu publicado com url");
