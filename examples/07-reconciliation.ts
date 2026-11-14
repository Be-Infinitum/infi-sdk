// Reconciliation: walks whole lists with paginate (customers and payments).
import { paginate } from "../src/index.js";
import { setup, show, step, uniq } from "./_setup.js";

const infi = await setup();

step("Create a product and ~25 customers");
const draftKey = crypto.randomUUID();
const draft = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "Reconciliation product", pricingModel: "subscription", currency: "BRL", basePrice: "10.00", billingCycle: "monthly" },
});
const product = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: draft.draftHash });
const s = uniq();
const total = 25;
for (let i = 1; i <= total; i++) {
  await infi.customers.create({ body: { productId: product.product.id, externalId: `cust_${s}_${String(i).padStart(2, "0")}` } });
}
show("created", total);

step("Paginate customers.list with limit 10");
// The sandbox account may already have customers from other runs: the proof is that
// pagination repeats no one and that all 25 created now show up.
const mine = `cust_${s}_`;
let seen = 0;
const ids = new Set<string>();
const ours = new Set<string>();
for await (const c of paginate((p) => infi.customers.list(p), { query: { limit: 10 } })) {
  seen += 1;
  ids.add(c.id);
  if (c.externalId?.startsWith(mine)) ours.add(c.id);
}
const first = await infi.customers.list({ query: { limit: 10 } });
show("items seen", seen);
show("distinct ids", ids.size);
show("created now", ours.size);
show("first page", `${first.data.length} items, nextCursor=${first.nextCursor ? "yes" : "no"}, summary=${JSON.stringify(first.summary)}`);
if (ids.size !== seen) throw new Error(`pagination repeated customers: ${seen} items, ${ids.size} distinct`);
if (ours.size !== total) throw new Error(`expected the ${total} customers created now, saw ${ours.size}`);
console.log(`   ✓ ${seen} customers in ${Math.ceil(seen / 10)} pages, no repeats, including the ${total} created now`);

step("Paginate payments.list");
let payments = 0;
for await (const _p of paginate((p) => infi.payments.list(p), { query: { limit: 10 } })) payments += 1;
show("payments", payments);
if (payments === 0) console.log("   (empty: in the local sandbox no payer has paid a link; pagination runs the same, there are just no items)");
