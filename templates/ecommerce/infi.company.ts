import { defineCompany } from "@beinfi/sdk";

/**
 * The store as code. `infi sync` applies it to the tenant of the key in
 * .env.local (sandbox), and again with the live key on go-live.
 *
 * Keys are prefixed with the template (`ecommerce/…`) so a second template
 * never collides with this one. A price change is a new version: people who
 * already subscribed keep the price they agreed to.
 */
export default defineCompany({
  schemaVersion: 1,
  template: { id: "ecommerce", version: "1.0.0" },
  products: [
    {
      key: "ecommerce/ebook",
      name: "Guia prático (ebook)",
      description: "O guia em PDF, entregue por e-mail assim que o pagamento confirma.",
      type: "item",
      pricingModel: "one_time",
      currency: "BRL",
      basePrice: "49.90",
      // Refund window a buyer's portal request resolves on its own (7–30 days).
      guaranteeDays: 7,
      deliverable: { kind: "file", path: "./assets/ebook.pdf" },
    },
    {
      key: "ecommerce/clube",
      name: "Clube mensal",
      description: "Um material novo por mês. Cancele quando quiser, no fim do mês pago.",
      type: "item",
      pricingModel: "subscription",
      currency: "BRL",
      billingCycle: "monthly",
      basePrice: "29.90",
      guaranteeDays: 7,
    },
  ],
  coupons: [
    { code: "LANCAMENTO", percentOff: "20", duration: "once", maxRedemptions: 100 },
    // A test discount: synced to sandbox, never to live.
    { code: "TESTE100", percentOff: "100", duration: "once", sandboxOnly: true },
  ],
  storefront: {
    slug: "__APP_SLUG__",
    name: "__APP_NAME__",
    products: ["ecommerce/ebook", "ecommerce/clube"],
    fulfillmentMode: "pickup",
  },
});
