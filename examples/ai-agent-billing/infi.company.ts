import { defineCompany } from "@beinfi/sdk";

const CURRENCY = "BRL";
const TOKEN_PRICE = "0.0001";
const REQUEST_PRICE = "0.005";

/**
 * Company as code for the AI agent billing sandbox demo.
 * Apply via `infi.sync` in index.ts (or `infi sync infi.company.ts`).
 */
export default defineCompany({
  products: [
    {
      key: "ai-agent-pro",
      name: "AI Agent Pro",
      type: "agent",
      pricingModel: "usage",
      currency: CURRENCY,
      meters: [
        {
          key: "tokens",
          displayName: "AI Tokens",
          unit: "token",
          aggregation: "sum",
          valueProperty: "value",
        },
        {
          key: "requests",
          displayName: "API Requests",
          unit: "request",
          aggregation: "count",
        },
      ],
      prices: [
        { meter: "tokens", model: "per_unit", unitAmount: TOKEN_PRICE, currency: CURRENCY },
        { meter: "requests", model: "per_unit", unitAmount: REQUEST_PRICE, currency: CURRENCY },
      ],
    },
  ],
});

export const PRODUCT_KEY = "ai-agent-pro";
export { CURRENCY, TOKEN_PRICE, REQUEST_PRICE };
