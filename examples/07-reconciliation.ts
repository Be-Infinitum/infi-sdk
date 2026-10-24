// Conciliação: percorre listas inteiras com paginate (clientes e pagamentos).
import { paginate } from "../src/index.js";
import { setup, show, step, uniq } from "./_setup.js";

const infi = await setup();

step("Criar um produto e ~25 clientes");
const draftKey = crypto.randomUUID();
const draft = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "Produto da conciliação", pricingModel: "subscription", currency: "BRL", basePrice: "10.00", billingCycle: "monthly" },
});
const product = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: draft.draftHash });
const s = uniq();
const total = 25;
for (let i = 1; i <= total; i++) {
  await infi.customers.create({ body: { productId: product.product.id, externalId: `cli_${s}_${String(i).padStart(2, "0")}` } });
}
show("criados", total);

step("Paginar customers.list com limit 10");
let seen = 0;
const ids = new Set<string>();
for await (const c of paginate((p) => infi.customers.list(p), { query: { limit: 10 } })) {
  seen += 1;
  ids.add(c.id);
}
const first = await infi.customers.list({ query: { limit: 10 } });
show("itens vistos", seen);
show("ids distintos", ids.size);
show("primeira página", `${first.data.length} itens, nextCursor=${first.nextCursor ? "sim" : "não"}, summary=${JSON.stringify(first.summary)}`);
if (seen !== total || ids.size !== total) throw new Error(`esperava ${total} clientes distintos, vi ${seen}/${ids.size}`);
console.log(`   ✓ ${total} clientes em ${Math.ceil(total / 10)} páginas, sem repetição`);

step("Paginar payments.list");
let payments = 0;
for await (const _p of paginate((p) => infi.payments.list(p), { query: { limit: 10 } })) payments += 1;
show("pagamentos", payments);
if (payments === 0) console.log("   (vazio: no sandbox local nenhum pagador pagou um link; a paginação roda igual, só não há itens)");
