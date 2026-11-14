// Sale to a buyer: published product -> delivery by URL -> webhook -> checkout -> wait for the payment.
import { setup, show, step } from "./_setup.js";

const infi = await setup();

step("Publish a one-time product");
const draftKey = crypto.randomUUID();
const saved = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "PDF guide", pricingModel: "one_time", currency: "BRL", basePrice: "19.00" },
});
const published = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: saved.draftHash });
const productId = published.product?.id;
if (!productId) throw new Error("the product was not published with an id");
show("productId", productId);

step("Set the delivery: the buyer receives this URL after paying");
await infi.products.setDeliverable({ path: { productId }, body: { kind: "link", url: "https://example.com/guide.pdf" } });
const deliverable = await infi.products.getDeliverable({ path: { productId } });
show("delivery", deliverable);

step("Subscribe a webhook to learn about the payment");
// In the sandbox it applies immediately and returns the secret once; in live it returns approvalUrl for a person to approve.
// If the sandbox does not have the secrets vault configured yet, it answers 503: the step is skipped.
try {
  const hook = await infi.webhooks.subscribe({ body: { url: "https://example.com/hooks/infi", events: ["payment.confirmed"] } });
  show("webhook", `${hook.status}${hook.secret ? " (secret received)" : ""}${hook.approvalUrl ? ` approve at ${hook.approvalUrl}` : ""}`);
  const list = await infi.webhooks.list();
  show("webhooks", list.data.map((w) => w.url));
} catch (e) {
  if ((e as { status?: number }).status !== 503) throw e;
  show("webhook", "503: the sandbox does not store webhook secrets yet");
}

step("Open a buyer's checkout");
const checkout = await infi.checkouts.create({
  body: { productId, customer: { externalId: `buyer_${crypto.randomUUID().slice(0, 8)}`, email: "buyer@example.com" } },
});
show("checkout", `${checkout.id} ${checkout.status} ${checkout.total} ${checkout.currency}`);
show("send the buyer to", checkout.url);
if (!checkout.url.includes(`/invoices/${checkout.id}`)) throw new Error("checkout url does not point to the invoice");

step("Read the checkout: this is how the code waits for the payment");
const again = await infi.checkouts.get({ path: { checkoutId: checkout.id } });
show("status", again.status);
show("payments", again.payments.length);
if (again.id !== checkout.id) throw new Error("the checkout that was read is not the one that was created");
