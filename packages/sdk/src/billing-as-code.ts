import type { Infi } from "./client.js";
import type { CreateProductRequest, Price, PriceInput, Product, Version } from "./types.js";

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
  /** Prepaid credit allowance granted each cycle (decimal string). Prepaid only. */
  creditsPerCycle?: string | null;
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
  action: "create" | "skip" | "update" | "bump";
  resource: "product" | "meter" | "version" | "price" | "deliverable";
  ref: string;
  /** Human-readable reason for an update/bump (e.g. changed fields). */
  detail?: string;
}

export interface SyncResult {
  planned: boolean;
  actions: SyncAction[];
}

export interface SyncOptions {
  /** Compute the diff without applying it (like `terraform plan`). */
  plan?: boolean;
}

// ── Diff helpers ─────────────────────────────────────────────────────────────

/** Normalize a decimal string for comparison (`"0.0020"` === `"0.002"`); null-ish → null. */
function normNum(v?: string | null): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : String(n);
}

function tiersKey(t?: unknown): string {
  return t ? JSON.stringify(t) : "";
}

type DesiredPrice = {
  meterId: string | null | undefined;
  model: string;
  unitAmount: string | null;
  currency: string;
  tiers?: unknown;
};

/** Match key for a price within a version: meter id, or a sentinel for the base fee. */
function priceKey(meterId: string | null | undefined): string {
  return meterId == null ? "__base__" : meterId;
}

/** True when the published version's prices already match the desired set. */
function pricesEqual(current: Price[], desired: DesiredPrice[]): boolean {
  if (current.length !== desired.length) return false;
  const cur = new Map(current.map((c) => [priceKey(c.meterId), c]));
  for (const d of desired) {
    const c = cur.get(priceKey(d.meterId));
    if (!c) return false;
    if ((c.model ?? "") !== d.model) return false;
    if (normNum(c.unitAmount) !== normNum(d.unitAmount)) return false;
    if ((c.currency ?? "") !== d.currency) return false;
    if (tiersKey(c.tiers) !== tiersKey(d.tiers)) return false;
  }
  return true;
}

function versionFieldsEqual(v: Version, p: BillingProduct): boolean {
  return (
    normNum(v.basePrice) === normNum(p.basePrice) &&
    normNum(v.creditsPerCycle) === normNum(p.creditsPerCycle) &&
    (v.billingCycle ?? null) === (p.billingCycle ?? null)
  );
}

/** Metadata patch for an existing product (only changed fields). */
function productPatch(existing: Product, p: BillingProduct): Partial<CreateProductRequest> {
  const name = p.name ?? p.key;
  const patch: Partial<CreateProductRequest> = {};
  if ((existing.name ?? "") !== name) patch.name = name;
  if (p.type && existing.type !== p.type) patch.type = p.type;
  if (p.pricingModel && existing.pricingModel !== p.pricingModel) patch.pricingModel = p.pricingModel;
  if (p.currency && existing.currency !== p.currency) patch.currency = p.currency;
  return patch;
}

/** Pick the version a bump should diff against: latest published, else latest. */
function currentVersion(versions: Version[]): Version | undefined {
  const byVersionDesc = [...versions].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return byVersionDesc.find((v) => v.status === "published") ?? byVersionDesc[0];
}

/** Create + publish a new version with the config's prices. Shared by seed and bump. */
async function publishVersion(
  infi: Infi,
  productId: string,
  p: BillingProduct,
  meterIdByKey: Map<string, string | undefined>,
): Promise<void> {
  const version = await infi.products.versions.create(productId, {
    billingCycle: p.billingCycle ?? null,
    basePrice: p.basePrice ?? null,
    creditsPerCycle: p.creditsPerCycle ?? null,
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
  }
  await infi.products.versions.publish(productId, version.id!);
}

/**
 * Apply a billing config as desired state (ADR 0002). Products are matched by
 * their unique per-tenant `key` (falling back to `name` for older tenants), then:
 *
 * - **create** the product when missing (+ seed a first published version);
 * - **update** its metadata (name/type/pricingModel/currency) when it drifted;
 * - **bump** the published version when the desired prices, base price, credits,
 *   or billing cycle differ — a NEW version is created + published, leaving prior
 *   versions immutable so existing subscriptions keep their pinned pricing;
 * - **skip** when nothing changed.
 *
 * Never deletes; never mutates a published version. Meters are created when
 * missing (metadata updates need a backend endpoint that does not exist yet).
 * Pass `{ plan: true }` to compute the diff without applying it.
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
    const existing = existingProducts.find((x) => (x.key ? x.key === p.key : x.name === name));
    let productId = existing?.id;

    if (!existing) {
      actions.push({ action: "create", resource: "product", ref: name });
      if (!plan) {
        const created = await infi.products.create({
          key: p.key,
          name,
          type: p.type,
          pricingModel: p.pricingModel,
          currency: p.currency,
          // Prepaid products require a billing cycle at creation; pass it through
          // (the backend rejects prepaid without one).
          billingCycle: p.billingCycle ?? undefined,
        });
        productId = created.id;
      }
    } else {
      const patch = productPatch(existing, p);
      const changed = Object.keys(patch);
      if (changed.length > 0) {
        actions.push({ action: "update", resource: "product", ref: name, detail: changed.join(", ") });
        if (!plan) await infi.products.update(productId!, patch);
      } else {
        actions.push({ action: "skip", resource: "product", ref: name });
      }
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

    // Versions — seed the first one, or bump when the desired pricing drifted.
    const versions = await infi.products.versions.list(productId);
    const current = currentVersion(versions);
    if (!current) {
      actions.push({ action: "create", resource: "version", ref: name });
      if (!plan) await publishVersion(infi, productId, p, meterIdByKey);
    } else {
      const desired: DesiredPrice[] = (p.prices ?? []).map((pr) => ({
        meterId: pr.meter ? meterIdByKey.get(pr.meter) : null,
        model: pr.model,
        unitAmount: pr.unitAmount ?? null,
        currency: pr.currency ?? p.currency ?? "BRL",
        tiers: pr.tiers,
      }));
      // A desired price referencing a not-yet-created meter (id undefined) is new by definition.
      const unresolvedMeter = desired.some((d) => d.meterId === undefined);
      const currentPrices = await infi.products.prices.list(productId, current.id!);
      const reasons: string[] = [];
      if (!versionFieldsEqual(current, p)) reasons.push("version fields");
      if (unresolvedMeter || !pricesEqual(currentPrices, desired)) reasons.push("prices");

      if (reasons.length > 0) {
        actions.push({ action: "bump", resource: "version", ref: name, detail: reasons.join(", ") });
        if (!plan) await publishVersion(infi, productId, p, meterIdByKey);
      } else {
        actions.push({ action: "skip", resource: "version", ref: name });
      }
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
