// Cobrança por uso: produto por uso (rascunho), cliente, eventos com eventId idempotente, consumo por meter.
import { setup, show, step } from "./_setup.js";

const infi = await setup();

step("Criar e publicar o produto por uso (rascunho -> publicar)");
const draftKey = crypto.randomUUID();
const draft = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "API de resumos", pricingModel: "usage", currency: "BRL", usage: { unit: "request", unitAmount: "0.05", aggregation: "count" } },
});
const product = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: draft.draftHash });
const productKey = product.product.key ?? (() => { throw new Error("produto sem key"); })();
show("productKey", productKey);

step("Descobrir a chave do meter (config.pull)");
const doc = await infi.config.pull();
const declared = doc.products.find((p) => p.key === product.product.key);
const meter = declared?.meters?.[0]?.key;
if (!meter) throw new Error("o pull não trouxe o meter do produto por uso");
show("meter", meter);

step("Criar o cliente com externalId");
const externalId = `user_${crypto.randomUUID().slice(0, 8)}`;
const customer = await infi.customers.create({ body: { productKey, externalId, name: "Ana", email: "ana@example.com" } });
show("customer", customer);

step("Registrar eventos de uso (e repetir um eventId)");
const ids = ["evt-1", "evt-2", "evt-3"];
for (const eventId of ids) {
  const r = await infi.usage.record({ body: { productKey, customerId: externalId, meter, value: "1", eventId } });
  show(eventId, r);
}
const replay = await infi.usage.record({ body: { productKey, customerId: externalId, meter, value: "1", eventId: "evt-1" } });
show("evt-1 de novo", replay);

step("Ler o consumo por meter (esperado: 3 eventos, não 4)");
const usage = await infi.usage.get({ query: { enrollmentId: customer.enrollmentId } });
for (const m of usage.meters) console.log(`   - ${m.meter}: total=${m.totalValue} ${m.unit}, eventos=${m.eventCount}, valor=${m.totalAmount ?? "-"} ${m.currency ?? ""}`);
const got = usage.meters.find((m) => m.meter === meter);
if (got?.eventCount !== 3) throw new Error(`esperava 3 eventos, veio ${got?.eventCount} (eventId repetido deveria contar uma vez)`);
console.log("   ✓ o eventId repetido contou uma vez");
