import type { BillingConfig } from "./billing-as-code.js";

/** Built-in company intents for vibe-coding / bootstrap. */
export type CompanyIntent = "crm" | "prepaid-ai-chat" | "one-time" | "usage-saas";

export interface CompanyIntentOptions {
  /** Display name. */
  name?: string;
  /** ISO currency. Default BRL. */
  currency?: string;
  /** One-time / pack price, or the per-unit rate on metered intents. */
  price?: string;
  /** Recurring platform fee for the subscription intents. */
  basePrice?: string;
  /** Deliverable URL for one-time intent. */
  deliverableUrl?: string;
}

const DEFAULTS: Record<CompanyIntent, { name: string; productKey: string }> = {
  crm: { name: "CRM", productKey: "crm" },
  "prepaid-ai-chat": { name: "AI Chat", productKey: "ai-chat" },
  "one-time": { name: "Store", productKey: "item" },
  "usage-saas": { name: "Usage SaaS", productKey: "integration" },
};

/** Build a `BillingConfig` / company config from a named intent. */
export function companyFromIntent(
  intent: CompanyIntent,
  options: CompanyIntentOptions = {},
): BillingConfig {
  const meta = DEFAULTS[intent];
  const name = options.name ?? meta.name;
  const currency = options.currency ?? "BRL";

  switch (intent) {
    case "crm":
      return {
        products: [
          {
            key: meta.productKey,
            name,
            type: "agent",
            pricingModel: "usage",
            currency,
            meters: [
              {
                key: "leads_ingested",
                displayName: "Leads ingested",
                unit: "unit",
                aggregation: "sum",
              },
            ],
            prices: [
              {
                meter: "leads_ingested",
                model: "per_unit",
                unitAmount: options.price ?? "0.10",
                currency,
              },
            ],
          },
        ],
      };

    case "prepaid-ai-chat":
      return {
        products: [
          {
            key: meta.productKey,
            name,
            type: "agent",
            pricingModel: "prepaid",
            billingCycle: "monthly",
            currency,
            basePrice: options.basePrice ?? options.price ?? "19.90",
            meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
            // per_unit: `prepaid_credits` was a literal alias of it and was removed
            // from the API (migration 000098). Same rating branch, one less name.
            prices: [{ meter: "tokens", model: "per_unit", unitAmount: "0.01" }],
            grants: [{ meter: "tokens", amount: "50000", on: "cycle" }],
          },
        ],
      };

    case "one-time":
      return {
        products: [
          {
            key: meta.productKey,
            name,
            type: "item",
            pricingModel: "one_time",
            currency,
            basePrice: options.price ?? "29.90",
            deliverable: options.deliverableUrl
              ? { kind: "link", url: options.deliverableUrl }
              : undefined,
          },
        ],
        // one-time checkout often needs no hosted login
      };

    case "usage-saas":
      return {
        products: [
          {
            key: meta.productKey,
            name,
            type: "agent",
            pricingModel: "subscription",
            billingCycle: "monthly",
            currency,
            // A subscription version will not publish with a zero base price
            // (422 from the API), so the platform fee has to have a default.
            basePrice: options.basePrice ?? "49.90",
            meters: [
              { key: "api_calls", displayName: "API calls", unit: "request", aggregation: "sum" },
            ],
            prices: [
              {
                meter: "api_calls",
                model: "per_unit",
                unitAmount: options.price ?? "0.01",
                currency,
              },
            ],
          },
        ],
      };

    default: {
      const _exhaustive: never = intent;
      throw new Error(`Unknown company intent: ${_exhaustive}`);
    }
  }
}

export const COMPANY_INTENTS: CompanyIntent[] = [
  "crm",
  "prepaid-ai-chat",
  "one-time",
  "usage-saas",
];
