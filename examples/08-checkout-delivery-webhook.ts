// Venda para um comprador: produto publicado -> entrega por URL -> webhook -> checkout -> esperar o pagamento.
import { setup, show, step } from "./_setup.js";

const infi = await setup();

step("Publicar um produto avulso");
const draftKey = crypto.randomUUID();
const saved = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "Guia em PDF", pricingModel: "one_time", currency: "BRL", basePrice: "19.00" },
});
const published = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: saved.draftHash });
const productId = published.product?.id;
if (!productId) throw new Error("o produto não saiu publicado com id");
show("productId", productId);

step("Definir a entrega: o comprador recebe esta URL depois de pagar");
await infi.products.setDeliverable({ path: { productId }, body: { kind: "link", url: "https://example.com/guia.pdf" } });
const deliverable = await infi.products.getDeliverable({ path: { productId } });
show("entrega", deliverable);

step("Inscrever um webhook para saber do pagamento");
// No sandbox aplica na hora e devolve o segredo uma vez; no live devolve approvalUrl para uma pessoa aprovar.
// Se o sandbox ainda não tiver o cofre de segredos configurado, responde 503: o passo é pulado.
try {
  const hook = await infi.webhooks.subscribe({ body: { url: "https://example.com/hooks/infi", events: ["payment.confirmed"] } });
  show("webhook", `${hook.status}${hook.secret ? " (segredo recebido)" : ""}${hook.approvalUrl ? ` aprovar em ${hook.approvalUrl}` : ""}`);
  const list = await infi.webhooks.list();
  show("webhooks", list.data.map((w) => w.url));
} catch (e) {
  if ((e as { status?: number }).status !== 503) throw e;
  show("webhook", "503: o sandbox ainda não guarda segredos de webhook");
}

step("Abrir o checkout de um comprador");
const checkout = await infi.checkouts.create({
  body: { productId, customer: { externalId: `buyer_${crypto.randomUUID().slice(0, 8)}`, email: "comprador@example.com" } },
});
show("checkout", `${checkout.id} ${checkout.status} ${checkout.total} ${checkout.currency}`);
show("mande o comprador para", checkout.url);
if (!checkout.url.includes(`/invoices/${checkout.id}`)) throw new Error("url do checkout não aponta para a fatura");

step("Ler o checkout: é assim que o código espera o pagamento");
const again = await infi.checkouts.get({ path: { checkoutId: checkout.id } });
show("status", again.status);
show("pagamentos", again.payments.length);
if (again.id !== checkout.id) throw new Error("checkout lido não é o criado");
