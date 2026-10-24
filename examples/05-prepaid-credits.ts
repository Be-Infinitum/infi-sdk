// Pré-pago: produto com grant e preço per_unit, crédito na carteira, consumo e débito pelo worker.
import type { components } from "../src/index.js";
import { setup, show, sleep, step, uniq } from "./_setup.js";

type CompanyDocument = components["schemas"]["CompanyDocument"];

const infi = await setup();
const s = uniq();

step("Declarar o produto pré-pago (billing as code)");
const document: CompanyDocument = {
  schemaVersion: 1,
  products: [
    {
      key: `creditos-${s}`,
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
const plan = await infi.config.plan({ body: { document } });
const applied = await infi.config.apply({ body: { document } }, { ifMatch: plan.planHash });
show("revisão", `#${applied.revision.number} ${applied.revision.status}`);

const productKey = document.products[0]!.key;
const meter = "tokens";
show("productKey / meter", `${productKey} / ${meter}`);

step("Criar o cliente");
const externalId = `user_${uniq()}`;
const customer = await infi.customers.create({ body: { productKey, externalId } });
const walletId = customer.enrollmentId;
show("enrollmentId (id da carteira)", walletId);

const balanceOf = async (): Promise<string> => {
  const w = await infi.customers.getWallet({ path: { enrollmentId: walletId }, query: { meter } });
  return "balance" in w ? w.balance : (w.balances.find((b) => b.meter === meter)?.balance ?? "0");
};

step("Creditar 1000 na carteira");
const credited = await infi.customers.creditWallet({ path: { enrollmentId: walletId }, body: { meter, amount: "1000", reason: "pacote inicial" } });
show("carteira", credited);
const before = await balanceOf();
show("saldo antes", before);

step("Registrar consumo de 200");
const rec = await infi.usage.record({ body: { productKey, customerId: externalId, meter, value: "200", eventId: `consumo-${uniq()}` } });
show("evento", rec);

step("Esperar o worker debitar (lendo o saldo a cada 10s, até 3 min)");
const deadline = Date.now() + 3 * 60_000;
let after = await balanceOf();
while (after === before && Date.now() < deadline) {
  await sleep(10_000);
  after = await balanceOf();
  console.log(`   ... saldo agora: ${after}`);
}
show("saldo antes", before);
show("saldo depois", after);
if (after === before) throw new Error("o saldo não desceu em 3 minutos: o worker não debitou a carteira do produto pré-pago");
console.log(`   ✓ debitado: ${Number(before) - Number(after)}`);
