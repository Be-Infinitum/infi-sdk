// Prepaid: product with a grant and per_unit price, wallet credit, consumption and debit by the worker.
import type { components } from "../src/index.js";
import { setup, show, sleep, step, uniq } from "./_setup.js";

type CompanyDocument = components["schemas"]["CompanyDocument"];

const infi = await setup();
const s = uniq();

step("Declare the prepaid product (billing as code)");
const document: CompanyDocument = {
  schemaVersion: 1,
  products: [
    {
      key: `credits-${s}`,
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
const plan = await infi.config.plan({ body: { document } });
const applied = await infi.config.apply({ body: { document } }, { ifMatch: plan.planHash });
show("revision", `#${applied.revision.number} ${applied.revision.status}`);

const productKey = document.products[0]!.key;
const meter = "tokens";
show("productKey / meter", `${productKey} / ${meter}`);

step("Create the customer");
const externalId = `user_${uniq()}`;
const customer = await infi.customers.create({ body: { productKey, externalId } });
const walletId = customer.enrollmentId;
show("enrollmentId (wallet id)", walletId);

const balanceOf = async (): Promise<string> => {
  const w = await infi.customers.getWallet({ path: { enrollmentId: walletId }, query: { meter } });
  return "balance" in w ? w.balance : (w.balances.find((b) => b.meter === meter)?.balance ?? "0");
};

step("Credit 1000 to the wallet");
const credited = await infi.customers.creditWallet({ path: { enrollmentId: walletId }, body: { meter, amount: "1000", reason: "starter pack" } });
show("wallet", credited);
const before = await balanceOf();
show("balance before", before);

step("Record consumption of 200");
const rec = await infi.usage.record({ body: { productKey, customerId: externalId, meter, value: "200", eventId: `consumption-${uniq()}` } });
show("event", rec);

step("Wait for the worker to debit (reading the balance every 10s, up to 3 min)");
const deadline = Date.now() + 3 * 60_000;
let after = await balanceOf();
while (after === before && Date.now() < deadline) {
  await sleep(10_000);
  after = await balanceOf();
  console.log(`   ... balance now: ${after}`);
}
show("balance before", before);
show("balance after", after);
if (after === before) throw new Error("the balance did not go down in 3 minutes: the worker did not debit the prepaid product's wallet");
console.log(`   ✓ debited: ${Number(before) - Number(after)}`);
