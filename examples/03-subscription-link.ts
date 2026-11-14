// Monthly subscription: same draft -> preview -> publish flow.
import { expectError, setup, show, step } from "./_setup.js";

const infi = await setup();

step("Save the monthly subscription draft");
const productKey = crypto.randomUUID();
const saved = await infi.products.saveDraft({
  path: { draftKey: productKey },
  body: { name: "Monthly club", description: "New content every month", pricingModel: "subscription", currency: "BRL", basePrice: "29.90", billingCycle: "monthly" },
});
show("draftHash", saved.draftHash);

step("Read the product preview with ?hash=");
const preview = await infi.products.getDraft({ path: { draftKey: productKey }, query: { hash: saved.draftHash } });
show("offer", `${preview.offer.name} — ${preview.offer.basePrice} ${preview.offer.currency}/${preview.offer.billingCycle}`);

step("Save the link draft");
const linkKey = crypto.randomUUID();
const link = await infi.links.saveDraft({
  path: { draftKey: linkKey },
  body: { product: { draftKey: productKey }, successUrl: "https://example.com/welcome", cancelUrl: "https://example.com/back" },
});
show("link preview", link.preview);

step("Editing the product after the preview invalidates the link hash (412)");
const edited = await infi.products.saveDraft(
  {
    path: { draftKey: productKey },
    body: { name: "Monthly club", description: "New content every month + community", pricingModel: "subscription", currency: "BRL", basePrice: "29.90", billingCycle: "monthly" },
  },
  { ifMatch: saved.draftHash },
);
show("new product draftHash", edited.draftHash);
const stale = await expectError(412, () => infi.links.publishDraft({ path: { draftKey: linkKey } }, { ifMatch: link.draftHash }));
show("InfiError", `status=${stale.status} code=${stale.code}`);

step("Re-read the link preview (new hash) and publish");
const fresh = await infi.links.getDraft({ path: { draftKey: linkKey } });
const published = await infi.links.publishDraft({ path: { draftKey: linkKey } }, { ifMatch: fresh.draftHash });
show("Link URL", published.link?.url ?? "(no url)");
if (!published.published || !published.link?.url) throw new Error("link was not published with a url");
