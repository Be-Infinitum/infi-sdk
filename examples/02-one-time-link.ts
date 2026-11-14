// One-time product: product draft -> preview -> link draft -> publish with If-Match.
import { expectError, setup, show, step } from "./_setup.js";

const infi = await setup();

step("Save the one-time product draft");
const productKey = crypto.randomUUID();
const saved = await infi.products.saveDraft({
  path: { draftKey: productKey },
  body: { name: "1h mentoring", description: "One individual session", pricingModel: "one_time", currency: "BRL", basePrice: "150.00" },
});
show("draftHash", saved.draftHash);

step("Read the product preview with ?hash=");
const preview = await infi.products.getDraft({ path: { draftKey: productKey }, query: { hash: saved.draftHash } });
show("offer", `${preview.offer.name} — ${preview.offer.basePrice} ${preview.offer.currency}`);
show("published", preview.published);

step("Save the link draft pointing to the product draft");
const linkKey = crypto.randomUUID();
const link = await infi.links.saveDraft({
  path: { draftKey: linkKey },
  body: { product: { draftKey: productKey }, successUrl: "https://example.com/thank-you" },
});
show("link preview", link.preview);
show("link draftHash", link.draftHash);

step("Publishing the link without If-Match must give 428");
const e428 = await expectError(428, () => infi.links.publishDraft({ path: { draftKey: linkKey } }));
show("InfiError", `status=${e428.status} code=${e428.code}`);

step("Publish the link with If-Match = draftHash");
const published = await infi.links.publishDraft({ path: { draftKey: linkKey } }, { ifMatch: link.draftHash });
show("published", published.published);
show("Link URL", published.link?.url ?? "(no url)");
if (!published.published || !published.link?.url) throw new Error("link was not published with a url");
