// Billing as code: declare the company in a document, plan, apply and check with pull.
import type { components } from "../src/index.js";
import { expectError, setup, show, step, uniq } from "./_setup.js";

type CompanyDocument = components["schemas"]["CompanyDocument"];

const infi = await setup();
const s = uniq();

const document: CompanyDocument = {
  schemaVersion: 1,
  products: [
    {
      key: `subscription-${s}`,
      name: "Pro Plan",
      type: "item",
      pricingModel: "subscription",
      currency: "BRL",
      basePrice: "49.90",
      billingCycle: "monthly",
    },
    {
      key: `usage-${s}`,
      name: "Pay-per-use API",
      type: "agent",
      pricingModel: "usage",
      currency: "BRL",
      meters: [{ key: "requests", unit: "request", aggregation: "count" }],
      prices: [{ meter: "requests", model: "per_unit", unitAmount: "0.05" }],
    },
    {
      key: `prepaid-${s}`,
      name: "AI Credits",
      type: "agent",
      pricingModel: "prepaid",
      currency: "BRL",
      basePrice: "0",
      billingCycle: "monthly",
      meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
      prices: [{ meter: "tokens", model: "per_unit", unitAmount: "0.01" }],
      grants: [{ meter: "tokens", amount: "1000", on: "payment" }],
    },
  ],
};

step("Plan the document (writes nothing)");
const plan = await infi.config.plan({ body: { document } });
show("planHash", plan.planHash);
show("mode", `${plan.mode}, hasChanges=${plan.hasChanges}, blocked=${plan.blocked}`);
for (const c of plan.changes) console.log(`   - [${c.action}] ${c.resource} ${c.ref}: ${c.sentence}`);

step("Apply with If-Match = planHash");
const applied = await infi.config.apply({ body: { document } }, { ifMatch: plan.planHash });
show("revision", `#${applied.revision.number} status=${applied.revision.status} mode=${applied.revision.mode}`);

step("Applying again with the stale hash must give 412");
const stale = await expectError(412, () => infi.config.apply({ body: { document } }, { ifMatch: plan.planHash }));
show("InfiError", `status=${stale.status} code=${stale.code} message="${stale.message}"`);
show("current.planHash (recomputed plan)", (stale.current as { planHash?: string } | undefined)?.planHash ?? "(no current)");

step("Applying without If-Match must give 428");
const noMatch = await expectError(428, () => infi.config.apply({ body: { document } }));
show("InfiError", `status=${noMatch.status} code=${noMatch.code}`);

step("Pull the document from the server and check the products");
const pulled = await infi.config.pull();
for (const p of pulled.products) console.log(`   - ${p.key} (${p.pricingModel}) meters=${p.meters?.length ?? 0} prices=${p.prices?.length ?? 0} grants=${p.grants?.length ?? 0}`);
for (const p of document.products) {
  const got = pulled.products.find((x) => x.key === p.key);
  if (!got) throw new Error(`product ${p.key} did not come back in the pull`);
  if (got.pricingModel !== p.pricingModel) throw new Error(`${p.key}: pricingModel ${got.pricingModel} != ${p.pricingModel}`);
}
console.log("   ✓ all 3 products came back");

step("Plan again: nothing to change");
const again = await infi.config.plan({ body: { document } });
show("hasChanges", again.hasChanges);
if (again.hasChanges) throw new Error("plan after apply still has changes");
