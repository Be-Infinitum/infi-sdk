import { defineBilling } from "@beinfi/sdk";

/** Stable product key — used by auth, checkout, and UsagePanel. */
export const PRODUCT_KEY = "starter";

/**
 * Billing source of truth for this app.
 * Apply with `bun run setup` or `infi sync infi.billing.ts` (requires @beinfi/cli).
 * Dry-run: `bun run plan` or `infi sync infi.billing.ts --plan`.
 */
export default defineBilling({
  products: [
    {
      key: PRODUCT_KEY,
      name: "__APP_NAME__ Starter",
      type: "agent",
      pricingModel: "prepaid",
      billingCycle: "monthly",
      currency: "BRL",
      basePrice: "29.90",
      meters: [
        {
          key: "usage_events",
          displayName: "Usage events",
          unit: "event",
          aggregation: "sum",
        },
      ],
      prices: [{ meter: "usage_events", model: "prepaid_credits", unitAmount: "0.01" }],
    },
  ],
  apps: [
    {
      slug: "__APP_SLUG__",
      name: "__APP_NAME__",
      allowedOrigins: ["http://localhost:__PORT__"],
      redirectUris: ["http://localhost:__PORT__/callback"],
    },
  ],
});
