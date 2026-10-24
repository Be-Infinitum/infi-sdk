// Billing as code: declara a empresa num documento, planeja, aplica e confere com pull.
import type { components } from "../src/index.js";
import { expectError, setup, show, step, uniq } from "./_setup.js";

type CompanyDocument = components["schemas"]["CompanyDocument"];

const infi = await setup();
const s = uniq();

const document: CompanyDocument = {
  schemaVersion: 1,
  products: [
    {
      key: `assinatura-${s}`,
      name: "Plano Pro",
      type: "item",
      pricingModel: "subscription",
      currency: "BRL",
      basePrice: "49.90",
      billingCycle: "monthly",
    },
    {
      key: `uso-${s}`,
      name: "API por uso",
      type: "agent",
      pricingModel: "usage",
      currency: "BRL",
      meters: [{ key: "requests", unit: "request", aggregation: "count" }],
      prices: [{ meter: "requests", model: "per_unit", unitAmount: "0.05" }],
    },
    {
      key: `prepago-${s}`,
      name: "Créditos de IA",
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

step("Planejar o documento (não escreve nada)");
const plan = await infi.config.plan({ body: { document } });
show("planHash", plan.planHash);
show("modo", `${plan.mode}, hasChanges=${plan.hasChanges}, blocked=${plan.blocked}`);
for (const c of plan.changes) console.log(`   - [${c.action}] ${c.resource} ${c.ref}: ${c.sentence}`);

step("Aplicar com If-Match = planHash");
const applied = await infi.config.apply({ body: { document } }, { ifMatch: plan.planHash });
show("revisão", `#${applied.revision.number} status=${applied.revision.status} modo=${applied.revision.mode}`);

step("Aplicar de novo com o hash velho deve dar 412");
const stale = await expectError(412, () => infi.config.apply({ body: { document } }, { ifMatch: plan.planHash }));
show("InfiError", `status=${stale.status} code=${stale.code} message="${stale.message}"`);
show("current.planHash (plano recomputado)", (stale.current as { planHash?: string } | undefined)?.planHash ?? "(sem current)");

step("Aplicar sem If-Match deve dar 428");
const noMatch = await expectError(428, () => infi.config.apply({ body: { document } }));
show("InfiError", `status=${noMatch.status} code=${noMatch.code}`);

step("Puxar o documento do servidor e conferir os produtos");
const pulled = await infi.config.pull();
for (const p of pulled.products) console.log(`   - ${p.key} (${p.pricingModel}) meters=${p.meters?.length ?? 0} prices=${p.prices?.length ?? 0} grants=${p.grants?.length ?? 0}`);
for (const p of document.products) {
  const got = pulled.products.find((x) => x.key === p.key);
  if (!got) throw new Error(`produto ${p.key} não veio no pull`);
  if (got.pricingModel !== p.pricingModel) throw new Error(`${p.key}: pricingModel ${got.pricingModel} != ${p.pricingModel}`);
}
console.log("   ✓ os 3 produtos vieram");

step("Planejar de novo: nada a mudar");
const again = await infi.config.plan({ body: { document } });
show("hasChanges", again.hasChanges);
if (again.hasChanges) throw new Error("plano após apply ainda tem mudanças");
