import type { BillingConfig, BillingGrant, BillingProduct } from "./billing-as-code.js";
import { InfiError } from "./errors.js";

// ── The canonical company document (schema v1) ──────────────────────────────
//
// What the server plans and applies (ADR 0025). Hand-typed from
// `GET /config/schema/v1.json`: the OpenAPI declares the document as a bare
// object. `defineCompany` is sugar over it; `toCompanyDocument` is the one
// place the sugar is resolved.

export type Decimal = string;

export interface DocumentMeter {
  key: string;
  displayName?: string;
  unit: "token" | "request" | "unit";
  aggregation: "sum" | "count";
  valueProperty?: string;
}

export interface DocumentPrice {
  meter: string;
  model: "flat" | "per_unit" | "tiered" | "volume" | "package";
  unitAmount?: Decimal;
  currency?: string;
  tiers?: unknown[];
}

export interface DocumentGrant {
  meter: string;
  amount: Decimal;
  on: "cycle" | "payment";
}

export interface DocumentProduct {
  key: string;
  renamedFrom?: string;
  name?: string;
  description?: string;
  guaranteeDays?: number;
  type: "agent" | "item";
  pricingModel: "subscription" | "one_time" | "usage" | "prepaid";
  currency?: string;
  billingCycle?: "weekly" | "monthly" | "annual";
  basePrice?: Decimal;
  meters?: DocumentMeter[];
  prices?: DocumentPrice[];
  grants?: DocumentGrant[];
}

export interface DocumentWebhook {
  url: string;
  events: string[];
  isActive?: boolean;
}

export interface CompanyDocument {
  schemaVersion: 1;
  products: DocumentProduct[];
  webhooks?: DocumentWebhook[];
}

/** Fields schema v1 has no room for, and where each went instead. */
const OUT_OF_V1: Record<string, string> = {
  deliverable:
    "deliverables are not part of the company document (schema v1). Attach one with infi.products.deliverable.save(productId, { kind: \"link\", url }) after the sync.",
  coupons:
    "coupons are not part of the company document (schema v1). Create them with infi.coupons.create(...).",
  storefront: "storefronts were removed (ADR 0024). Sell with a payment link or the embedded checkout.",
  storefronts: "storefronts were removed (ADR 0024). Sell with a payment link or the embedded checkout.",
  apps: "hosted-login apps are not part of the company document.",
};

function invalid(message: string): never {
  throw new InfiError(message, 422, "company_document_invalid", {
    hint: "Fix infi.company.ts. The document's schema is " + "https://api.beinfi.com/config/schema/v1.json",
  });
}

/** Copy the defined, non-null values of `keys` from `src`. */
function pick<T extends object>(src: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    const v = src[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/**
 * The deprecated `creditsPerCycle` as a v1 grant. The document has no
 * `creditsPerCycle`, and a grant must name a meter the product declares, so it
 * lands on the product's only meter. Anything else is ambiguous and refused:
 * the old sync put it on an implicit `credits` meter nobody declared.
 */
function legacyCycleGrant(p: BillingProduct): BillingGrant | null {
  if (p.creditsPerCycle == null || p.creditsPerCycle === "") return null;
  const meters = p.meters ?? [];
  if (meters.length !== 1) {
    invalid(
      `${p.key}: creditsPerCycle is deprecated and needs exactly one declared meter to land on (found ${meters.length}). ` +
        `Write grants: [{ meter: "<meter key>", amount: "${p.creditsPerCycle}", on: "cycle" }] instead.`,
    );
  }
  return { meter: meters[0]!.key, amount: p.creditsPerCycle, on: "cycle" };
}

/** The grants a product's version carries: `grants`, else the legacy cycle allowance. */
function effectiveGrants(p: BillingProduct): BillingGrant[] {
  if (p.grants?.length) return p.grants;
  const legacy = legacyCycleGrant(p);
  return legacy ? [legacy] : [];
}

/**
 * Checks the schema cannot say, or says late: run before any network call so
 * a typo fails here, with the product named, instead of as a 422 from plan.
 */
export function assertValidConfig(config: BillingConfig): void {
  if (!config || !Array.isArray(config.products)) invalid("The company config has no products array.");
  for (const k of Object.keys(config)) {
    if (OUT_OF_V1[k]) invalid(`${k}: ${OUT_OF_V1[k]}`);
  }
  for (const p of config.products) {
    for (const k of Object.keys(p)) {
      if (OUT_OF_V1[k]) invalid(`${p.key}.${k}: ${OUT_OF_V1[k]}`);
    }
    const meterKeys = new Set((p.meters ?? []).map((m) => m.key));
    for (const m of p.meters ?? []) {
      if (m.aggregation !== "sum" && m.aggregation !== "count") {
        invalid(`${p.key}: meter ${m.key} aggregation must be "sum" or "count" (got ${JSON.stringify(m.aggregation)}).`);
      }
    }
    for (const [i, pr] of (p.prices ?? []).entries()) {
      if (!pr.meter) {
        invalid(
          `${p.key}: prices[${i}] has no meter. Prices are per-meter rates; a flat amount belongs in the product's basePrice.`,
        );
      }
      if (!meterKeys.has(pr.meter)) invalid(`${p.key}: prices[${i}] rates meter ${pr.meter}, which the product does not declare.`);
    }
    if (p.grants?.length && p.creditsPerCycle) {
      invalid(`${p.key}: creditsPerCycle and grants together. Keep grants only.`);
    }
    const grants = effectiveGrants(p);
    const seen = new Set<string>();
    for (const g of grants) {
      if (!meterKeys.has(g.meter)) invalid(`${p.key}: grant on meter ${g.meter}, which the product does not declare.`);
      if (seen.has(g.meter)) {
        invalid(
          `${p.key}: two grants on meter ${g.meter}. Schema v1 allows one grant per meter per version (cycle or payment, not both).`,
        );
      }
      seen.add(g.meter);
    }
  }
  for (const w of config.webhooks ?? []) {
    if (!/^https:\/\/[^/\s]+/.test(w.url)) invalid(`webhook ${w.url}: the URL must be https.`);
    if (!w.events?.length) invalid(`webhook ${w.url}: subscribe to at least one event.`);
  }
}

/**
 * Serialize a `defineCompany(...)` config to the canonical document the server
 * plans (schema v1). Nulls are dropped (the schema has no nulls), sugar is
 * resolved (`creditsPerCycle` → a cycle grant), and nothing is defaulted that
 * the server would not write itself, so a pulled file plans to no change.
 */
export function toCompanyDocument(config: BillingConfig): CompanyDocument {
  assertValidConfig(config);
  const products: DocumentProduct[] = config.products.map((p) => {
    const out = pick(p as unknown as DocumentProduct, [
      "key",
      "renamedFrom",
      "name",
      "description",
      "guaranteeDays",
      "type",
      "pricingModel",
      "currency",
      "billingCycle",
      "basePrice",
    ]) as DocumentProduct;
    if (p.meters?.length) {
      out.meters = p.meters.map(
        (m) => pick(m as DocumentMeter, ["key", "displayName", "unit", "aggregation", "valueProperty"]) as DocumentMeter,
      );
    }
    if (p.prices?.length) {
      out.prices = p.prices.map(
        (pr) => pick(pr as DocumentPrice, ["meter", "model", "unitAmount", "currency", "tiers"]) as DocumentPrice,
      );
    }
    const grants = effectiveGrants(p);
    if (grants.length) out.grants = grants.map((g) => ({ meter: g.meter, amount: g.amount, on: g.on }));
    return out;
  });
  const doc: CompanyDocument = { schemaVersion: 1, products };
  if (config.webhooks?.length) {
    doc.webhooks = config.webhooks.map(
      (w) => pick({ ...w, events: [...w.events] } as DocumentWebhook, ["url", "events", "isActive"]) as DocumentWebhook,
    );
  }
  return doc;
}

/** A pulled document as `defineCompany` input (drops the version marker). */
export function fromCompanyDocument(doc: CompanyDocument): BillingConfig {
  const { schemaVersion: _v, ...rest } = doc;
  return rest as unknown as BillingConfig;
}
