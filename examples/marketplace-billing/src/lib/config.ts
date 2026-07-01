// Billing shape for the demo — shared by the seed/ingest scripts and the dashboard.
//
// The business: a company that syncs inventory across marketplaces and bills each
// customer BY USAGE, at prices that differ per organization. Same `inventory_update`
// event costs a different amount for a "standard" org vs a "premium" org — that
// per-org price is a rate-card, the headline feature.

export const PRODUCT_KEY = "integration";
export const CURRENCY = "BRL";

/** The three billed events. `basePrice` is the plan (default) per-unit price. */
export const METERS = [
  { key: "inventory_update", displayName: "Inventory update", basePrice: "0.020" },
  { key: "price_update", displayName: "Price update", basePrice: "0.010" },
  { key: "notification", displayName: "Notification", basePrice: "0.005" },
] as const;

export type MeterKey = (typeof METERS)[number]["key"];

/** How many events of EACH meter the ingest script emits per org (equal for both,
 *  so the invoice difference is purely the rate-card delta). */
export const EVENTS_PER_METER: Record<MeterKey, number> = {
  inventory_update: 1000,
  price_update: 300,
  notification: 500,
};

/** Two orgs, same event volume, DIFFERENT per-meter rate-cards (all three overridden). */
export const ORGS: {
  externalId: string;
  name: string;
  tier: "standard" | "premium";
  email: string;
  rates: Record<MeterKey, string>;
}[] = [
  {
    externalId: "org-acme",
    name: "Acme Marketplace",
    tier: "standard",
    email: "billing@acme.example",
    rates: { inventory_update: "0.020", price_update: "0.010", notification: "0.005" },
  },
  {
    externalId: "org-globex",
    name: "Globex Retail",
    tier: "premium",
    email: "billing@globex.example",
    rates: { inventory_update: "0.035", price_update: "0.018", notification: "0.009" },
  },
];

/** Days in the past to anchor the subscription so its first monthly period is already
 *  ended (invoice generation only bills an ENDED period). */
export const BACKDATE_DAYS = 31;
