import { defineCompany } from "@beinfi/sdk";

/**
 * The store as code. `infi sync` applies it to the tenant of the key in
 * .env.local (sandbox), and again with the live key on go-live. Then
 * `npm run infi:seed` creates the access key, says what each product grants
 * and builds the course from `curso.seed.json` — once; after that the course
 * is edited through the API (dashboard, CLI or your AI via the Infi MCP),
 * without a deploy.
 *
 * Keys are prefixed with the template (`curso/…`) so a second template never
 * collides with this one. A price change is a new version: people who already
 * subscribed keep the price they agreed to.
 */
export default defineCompany({
  schemaVersion: 1,
  template: { id: "curso", version: "1.0.0" },
  products: [
    {
      key: "curso/vitalicio",
      name: "Curso completo (acesso vitalício)",
      description: "Todas as aulas, para sempre, e o grupo de alunos.",
      type: "item",
      pricingModel: "one_time",
      currency: "BRL",
      basePrice: "297.00",
      guaranteeDays: 7,
    },
    {
      key: "curso/assinatura",
      name: "Assinatura mensal",
      description: "Acesso a tudo enquanto a assinatura estiver ativa. Cancele quando quiser.",
      type: "item",
      pricingModel: "subscription",
      currency: "BRL",
      billingCycle: "monthly",
      basePrice: "39.90",
      guaranteeDays: 7,
    },
  ],
  coupons: [
    { code: "TURMA1", percentOff: "20", duration: "once", maxRedemptions: 100 },
    // A test discount: synced to sandbox, never to live.
    { code: "TESTE100", percentOff: "100", duration: "once", sandboxOnly: true },
  ],
  storefront: {
    slug: "__APP_SLUG__",
    name: "__APP_NAME__",
    products: ["curso/vitalicio", "curso/assinatura"],
    fulfillmentMode: "pickup",
  },
});
