import type { BillingConfig } from "./billing-as-code.js";

/** Built-in company intents for vibe-coding / bootstrap. */
export type CompanyIntent = "crm" | "prepaid-ai-chat" | "one-time" | "usage-saas";

export interface CompanyIntentOptions {
  /** Identity app slug (default per intent). */
  slug?: string;
  /** App display name. */
  name?: string;
  /**
   * Public app origin (preview or prod URL). Used for allowedOrigins + /callback.
   * Optional in sandbox when the API skips allowlists; still recommended.
   */
  appUrl?: string;
  /** ISO currency. Default BRL. */
  currency?: string;
  /** One-time / pack price as decimal string. */
  price?: string;
  /** Deliverable URL for one-time intent. */
  deliverableUrl?: string;
}

const DEFAULTS: Record<CompanyIntent, { slug: string; name: string; productKey: string }> = {
  crm: { slug: "crm", name: "CRM", productKey: "crm" },
  "prepaid-ai-chat": { slug: "ai-chat", name: "AI Chat", productKey: "ai-chat" },
  "one-time": { slug: "store", name: "Store", productKey: "item" },
  "usage-saas": { slug: "saas", name: "Usage SaaS", productKey: "integration" },
};

function appsFor(slug: string, name: string, appUrl?: string): BillingConfig["apps"] {
  if (!appUrl) {
    return [{ slug, name, allowedOrigins: [], redirectUris: [] }];
  }
  const origin = appUrl.replace(/\/$/, "");
  return [
    {
      slug,
      name,
      allowedOrigins: [origin],
      redirectUris: [`${origin}/callback`],
    },
  ];
}

/** Build a `BillingConfig` / company config from a named intent. */
export function companyFromIntent(
  intent: CompanyIntent,
  options: CompanyIntentOptions = {},
): BillingConfig {
  const meta = DEFAULTS[intent];
  const slug = options.slug ?? meta.slug;
  const name = options.name ?? meta.name;
  const currency = options.currency ?? "BRL";
  const apps = appsFor(slug, name, options.appUrl);

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
        apps,
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
            basePrice: options.price ?? "19.90",
            meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
            prices: [{ meter: "tokens", model: "prepaid_credits", unitAmount: "0.01" }],
          },
        ],
        apps,
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
        apps: options.appUrl ? apps : undefined,
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
        apps,
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
