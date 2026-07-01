import type { Infi } from "./client.js";
import type { PriceInput } from "./types.js";

// ── Declarative billing config ("billing as code") ──────────────────────────

export interface BillingMeter {
  /** Stable slug used by track() and as the idempotency key (unique per product). */
  key: string;
  displayName?: string;
  unit: "token" | "request" | "unit";
  aggregation: "sum" | "count" | "unique_count" | "max" | "last";
}

export interface BillingPrice {
  /** Meter key this price rates; omit for a flat base fee. */
  meter?: string;
  model: PriceInput["model"];
  unitAmount?: string;
  currency?: string;
  tiers?: PriceInput["tiers"];
}

export interface BillingProduct {
  /** Stable natural key. Also the product name unless `name` is given. */
  key: string;
  name?: string;
  type: "agent" | "item";
  pricingModel: "subscription" | "one_time" | "usage" | "prepaid";
  currency?: string;
  billingCycle?: "weekly" | "monthly" | "annual" | null;
  basePrice?: string | null;
  meters?: BillingMeter[];
  prices?: BillingPrice[];
  /** Link deliverables only (file uploads use products.deliverable.presign/save). */
  deliverable?: { kind: "link"; url: string };
}

export interface BillingConfig {
  products: BillingProduct[];
}

/** Identity helper for authoring a typed billing config. */
export function defineBilling(config: BillingConfig): BillingConfig {
  return config;
}

export interface SyncAction {
  action: "create" | "skip";
  resource: "product" | "meter" | "version" | "price" | "deliverable";
  ref: string;
}

export interface SyncResult {
  planned: boolean;
  actions: SyncAction[];
}

export interface SyncOptions {
  /** Compute the diff without applying it (like `terraform plan`). */
  plan?: boolean;
}

/**
 * Apply a billing config idempotently. Products are matched by name, meters by
 * `(product, name)`, and prices are seeded once (a first published version) —
 * re-running is a no-op. Price changes on an existing product need a version bump
 * (not yet automated); such products are reported as `skip`.
 *
 * Products are matched by their unique per-tenant `key` (falling back to `name`
 * for tenants created before keys existed).
 */
export async function syncBilling(
  infi: Infi,
  config: BillingConfig,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const plan = opts.plan ?? false;
  const actions: SyncAction[] = [];
  const existingProducts = await infi.products.list();

  for (const p of config.products) {
    const name = p.name ?? p.key;
    // Prefer the natural key (unique per tenant); fall back to name for older tenants.
    let productId = existingProducts.find((x) => (x.key ? x.key === p.key : x.name === name))?.id;

    if (!productId) {
      actions.push({ action: "create", resource: "product", ref: name });
      if (!plan) {
        const created = await infi.products.create({
          key: p.key,
          name,
          type: p.type,
          pricingModel: p.pricingModel,
          currency: p.currency,
        });
        productId = created.id;
      }
    } else {
      actions.push({ action: "skip", resource: "product", ref: name });
    }

    // In plan mode without a real product id we can only report the parent create.
    if (!productId) continue;

    // Meters — create any missing, keyed by (product, name).
    const existingMeters = await infi.products.meters.list(productId);
    const meterIdByKey = new Map<string, string | undefined>(
      existingMeters.map((m) => [m.name ?? "", m.id]),
    );
    for (const m of p.meters ?? []) {
      if (meterIdByKey.has(m.key)) {
        actions.push({ action: "skip", resource: "meter", ref: `${name}/${m.key}` });
        continue;
      }
      actions.push({ action: "create", resource: "meter", ref: `${name}/${m.key}` });
      if (!plan) {
        const created = await infi.products.meters.create(productId, {
          name: m.key,
          displayName: m.displayName ?? m.key,
          unit: m.unit,
          aggregation: m.aggregation,
        });
        meterIdByKey.set(m.key, created.id);
      }
    }

    // Prices — seed once. If a version already exists, leave it (immutable history).
    const versions = await infi.products.versions.list(productId);
    if (versions.length === 0) {
      actions.push({ action: "create", resource: "version", ref: name });
      if (!plan) {
        const version = await infi.products.versions.create(productId, {
          billingCycle: p.billingCycle ?? null,
          basePrice: p.basePrice ?? null,
        });
        for (const pr of p.prices ?? []) {
          const meterId = pr.meter ? meterIdByKey.get(pr.meter) : undefined;
          await infi.products.prices.add(productId, version.id!, {
            model: pr.model,
            unitAmount: pr.unitAmount,
            currency: pr.currency ?? p.currency ?? "BRL",
            meterId,
            tiers: pr.tiers,
          } as PriceInput);
          actions.push({ action: "create", resource: "price", ref: `${name}/${pr.meter ?? "base"}` });
        }
        await infi.products.versions.publish(productId, version.id!);
      }
    } else {
      actions.push({ action: "skip", resource: "version", ref: name });
    }

    // Deliverable (link only in sync; file uploads go through presign/save).
    if (p.deliverable?.kind === "link") {
      actions.push({ action: "create", resource: "deliverable", ref: name });
      if (!plan) {
        await infi.products.deliverable.save(productId, { kind: "link", url: p.deliverable.url });
      }
    }
  }

  return { planned: plan, actions };
}
