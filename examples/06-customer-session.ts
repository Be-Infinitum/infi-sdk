// Customer session (portal): create, verify, revoke, verify again (fails).
import { expectError, setup, show, step, uniq } from "./_setup.js";

const infi = await setup();

step("Create a product and a customer");
const draftKey = crypto.randomUUID();
const draft = await infi.products.saveDraft({
  path: { draftKey },
  body: { name: "Portal plan", pricingModel: "subscription", currency: "BRL", basePrice: "19.90", billingCycle: "monthly" },
});
const product = await infi.products.publishDraft({ path: { draftKey } }, { ifMatch: draft.draftHash });
const externalId = `user_${uniq()}`;
const customer = await infi.customers.create({ body: { productId: product.product.id, externalId, name: "Bia", email: "bia@example.com" } });
show("customer", customer);

step("Create the session for the externalId");
const session = await infi.customerSessions.create({ body: { externalId } });
show("token", `${session.token.slice(0, 12)}…`);
show("scope / origin / expires", `${session.scope} / ${session.origin} / ${session.expiresAt}`);

step("Verify the token");
const verified = await infi.customerSessions.verify({ headers: { "X-Buyer-Token": session.token } });
show("buyer", verified.buyer);
show("access", verified.access.length);
if (!verified.buyer.externalIds.includes(externalId)) throw new Error("the token does not point to the externalId that was created");

step("Revoke the token");
const revoked = await infi.customerSessions.revoke({ body: { token: session.token } });
show("revoked", revoked.revoked);

step("Verify again (must fail)");
const err = await expectError(401, () => infi.customerSessions.verify({ headers: { "X-Buyer-Token": session.token } }));
show("InfiError", `status=${err.status} code=${err.code}`);
