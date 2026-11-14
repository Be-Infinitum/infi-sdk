// Usage-based billing: usage product (draft), customer, events with an idempotent eventId, consumption per meter.
import { setup, show, step } from "./_setup.js";

const infi = await setup();

step("Create and publish the usage product (draft -> publish)");
const draftKey = crypto.randomUUID();
const draft = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "Summaries API", pricingModel: "usage", currency: "BRL", usage: { unit: "request", unitAmount: "0.05", aggregation: "count" } },
});
const product = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: draft.draftHash });
const productKey = product.product.key ?? (() => { throw new Error("product has no key"); })();
show("productKey", productKey);

step("Find the meter key (config.pull)");
const doc = await infi.config.pull();
const declared = doc.products.find((p) => p.key === product.product.key);
const meter = declared?.meters?.[0]?.key;
if (!meter) throw new Error("the pull did not bring the usage product's meter");
show("meter", meter);

step("Create the customer with externalId");
const externalId = `user_${crypto.randomUUID().slice(0, 8)}`;
const customer = await infi.customers.create({ body: { productKey, externalId, name: "Ana", email: "ana@example.com" } });
show("customer", customer);

step("Record usage events (and repeat an eventId)");
const ids = ["evt-1", "evt-2", "evt-3"];
for (const eventId of ids) {
  const r = await infi.usage.record({ body: { productKey, customerId: externalId, meter, value: "1", eventId } });
  show(eventId, r);
}
const replay = await infi.usage.record({ body: { productKey, customerId: externalId, meter, value: "1", eventId: "evt-1" } });
show("evt-1 again", replay);

step("Read consumption per meter (expected: 3 events, not 4)");
const usage = await infi.usage.get({ query: { enrollmentId: customer.enrollmentId } });
for (const m of usage.meters) console.log(`   - ${m.meter}: total=${m.totalValue} ${m.unit}, events=${m.eventCount}, amount=${m.totalAmount ?? "-"} ${m.currency ?? ""}`);
const got = usage.meters.find((m) => m.meter === meter);
if (got?.eventCount !== 3) throw new Error(`expected 3 events, got ${got?.eventCount} (a repeated eventId should count once)`);
console.log("   ✓ the repeated eventId counted once");
