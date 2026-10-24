// Sessão do cliente (portal): criar, verificar, revogar, verificar de novo (falha).
import { expectError, setup, show, step, uniq } from "./_setup.js";

const infi = await setup();

step("Criar um produto e um cliente");
const draftKey = crypto.randomUUID();
const draft = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "Plano do portal", pricingModel: "subscription", currency: "BRL", basePrice: "19.90", billingCycle: "monthly" },
});
const product = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: draft.draftHash });
const externalId = `user_${uniq()}`;
const customer = await infi.customers.create({ body: { productId: product.product.id, externalId, name: "Bia", email: "bia@example.com" } });
show("customer", customer);

step("Criar a sessão para o externalId");
const session = await infi.customerSessions.create({ body: { externalId } });
show("token", `${session.token.slice(0, 12)}…`);
show("escopo / origem / expira", `${session.scope} / ${session.origin} / ${session.expiresAt}`);

step("Verificar o token");
const verified = await infi.customerSessions.verify({ headers: { "X-Buyer-Token": session.token } });
show("comprador", verified.buyer);
show("acessos", verified.access.length);
if (!verified.buyer.externalIds.includes(externalId)) throw new Error("o token não aponta para o externalId criado");

step("Revogar o token");
const revoked = await infi.customerSessions.revoke({ body: { token: session.token } });
show("revogados", revoked.revoked);

step("Verificar de novo (deve falhar)");
const err = await expectError(401, () => infi.customerSessions.verify({ headers: { "X-Buyer-Token": session.token } }));
show("InfiError", `status=${err.status} code=${err.code}`);
