import type { Infi } from "./client.js";
import type {
  CreateProductRequest,
  Price,
  PriceInput,
  Product,
  Version,
  WebhookEndpoint,
} from "./types.js";
import type { WebhookEventType } from "./webhooks.js";

// ── Declarative company config ("company as code" — ADR 0004)
// Legacy name: billing as code. Prefer defineCompany() in new code. ───────────

export interface BillingMeter {
  /** Stable slug used by track() and as the idempotency key (unique per product). */
  key: string;
  displayName?: string;
  unit: "token" | "request" | "unit";
  aggregation: "sum" | "count" | "unique_count" | "max" | "last";
  /**
   * JSON path on the usage event for the numeric value (backend ingest).
   * Use `"value"` for the standard `track({ value })` shape.
   */
  valueProperty?: string | null;
}

export interface BillingPrice {
  /**
   * Meter key this price rates. Required: the backend treats every price as a
   * meter rate. A flat amount is not a price — it is the product's `basePrice`.
   */
  meter: string;
  model: PriceInput["model"];
  unitAmount?: string;
  currency?: string;
  tiers?: PriceInput["tiers"];
}

/**
 * Declarative meter grant on the plan.
 * `on: "cycle"` credits at period open/renew; `on: "payment"` credits on
 * `payment.confirmed` (backend ADR 0021). Both ride on the published version.
 */
export interface BillingGrant {
  /** Catalog meter key (same as meters[].key). */
  meter: string;
  /** Decimal string amount to credit. */
  amount: string;
  on: "cycle" | "payment";
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
  /**
   * @deprecated Prefer `grants: [{ meter, amount, on: "cycle" }]`.
   * Prepaid credit allowance granted each cycle (decimal string).
   */
  creditsPerCycle?: string | null;
  /** Meter grants — credited on cycle renewal and/or on `payment.confirmed`. */
  grants?: BillingGrant[];
  meters?: BillingMeter[];
  prices?: BillingPrice[];
  /** Link deliverables only (file uploads use products.deliverable.presign/save). */
  deliverable?: { kind: "link"; url: string };
}

/** Effective cycle grant amount: first `grants[{on:cycle}]`, else `creditsPerCycle`. */
export function cycleGrantAmount(p: BillingProduct): string | null {
  return cycleGrant(p)?.amount ?? null;
}

/**
 * The cycle grant to send, meter key included. The deprecated `creditsPerCycle`
 * had no meter, so it maps onto `credits` — the alias for the legacy pool.
 */
export function cycleGrant(p: BillingProduct): BillingGrant | null {
  const fromGrant = (p.grants ?? []).find((g) => g.on === "cycle");
  if (fromGrant) return fromGrant;
  if (p.creditsPerCycle) return { meter: "credits", amount: p.creditsPerCycle, on: "cycle" };
  return null;
}

/**
 * Pre-flight config validation.
 *
 * The backend rejects a price without a meter — "prices are meter rates; flat
 * amounts live on the version's base price" — but only at PUBLISH, which
 * `--plan` never reaches. Without this check a plan came back green and the
 * apply then died mid-flight with the products already created. On a live
 * tenant that is worse than failing early.
 */
export function assertValidConfig(config: BillingConfig): void {
  for (const p of config.products ?? []) {
    for (const [i, pr] of (p.prices ?? []).entries()) {
      if (!pr.meter) {
        throw new Error(
          `${p.key}: prices[${i}] has no meter. Prices are per-meter rates; ` +
            `a flat amount belongs in the product's basePrice.`,
        );
      }
    }
  }
}

/**
 * Every grant the version should carry — `on: "cycle"` and `on: "payment"`.
 *
 * The backend has supported `on_event=payment` since ADR 0021
 * (`product_version_grants` + `internal/metergrant`, which credits the wallet
 * on `payment.confirmed`). Sync used to drop those, which forced every prepaid
 * top-up to hand-roll a webhook, a product lookup and its own idempotency for
 * something the platform already did.
 */
export function versionGrants(p: BillingProduct): BillingGrant[] {
  const declared = p.grants ?? [];
  if (declared.length > 0) return declared;
  const legacy = cycleGrant(p);
  return legacy ? [legacy] : [];
}

/**
 * The cycle grant a PUBLISHED version actually carries.
 *
 * The backend dropped `product_versions.credits_per_cycle` (migration 000098) in
 * favour of per-meter grants, so the remote side of a drift comparison has to be
 * derived from `grants[]` — reading the old field silently compared undefined to
 * a real amount and reported drift on every sync.
 */
export function versionCycleGrant(v: Version | undefined): string | null {
  const grant = (v?.grants ?? []).find((g) => g.on === "cycle");
  return grant?.amount ?? null;
}

export interface BillingWebhook {
  /** Stable natural key — the delivery URL. */
  url: string;
  /**
   * Derived from the backend's enum, so an event the backend never emits is a
   * compile error. `assertValidConfig` repeats the check at runtime for JS
   * callers.
   */
  events: WebhookEventType[];
  isActive?: boolean;
}

export interface BillingConfig {
  products: BillingProduct[];
  /** Webhook endpoints (url + subscribed events). */
  webhooks?: BillingWebhook[];
}

/**
 * Identity helper for authoring a typed company/billing config.
 * Prefer `defineCompany` (same shape; company as code).
 */
export function defineBilling(config: BillingConfig): BillingConfig {
  return config;
}

export interface SyncAction {
  action: "create" | "skip" | "update" | "bump" | "blocked";
  resource: "product" | "meter" | "version" | "price" | "deliverable" | "app" | "webhook" | "grant";
  ref: string;
  /** Human-readable reason for an update/bump/blocked (e.g. changed fields, drift). */
  detail?: string;
}

/** Provenance recorded after a sync — a fingerprint of the applied backend state. */
export interface EntityLock {
  /** Canonical fingerprint of the backend state this entity had after the sync. */
  state: string;
  syncedAt: string;
}

/** Per-product provenance (adds the published version id). */
export interface ProductLock extends EntityLock {
  versionId?: string;
}

/** `infi.billing.lock.json` — what the last sync applied, keyed by natural key. */
export interface SyncLock {
  version: 1;
  products: Record<string, ProductLock>;
  /** Per-app provenance, keyed by slug. */
  /** Per-webhook provenance, keyed by url. */
  webhooks?: Record<string, EntityLock>;
}

/** A product whose backend state changed outside the config since the last sync. */
export interface DriftEntry {
  product: string;
  detail: string;
}

export interface SyncResult {
  planned: boolean;
  actions: SyncAction[];
  /** Drift detected against the previous lock (changed in the dashboard since last sync). */
  drift: DriftEntry[];
  /** Fresh lock to persist (unchanged in plan mode). */
  lock: SyncLock;
}

export interface SyncOptions {
  /** Compute the diff without applying it (like `terraform plan`). */
  plan?: boolean;
  /** Previous lockfile (drift is measured against this). */
  lock?: SyncLock;
  /** Apply even when the backend drifted from the lock (overwrites dashboard edits). */
  force?: boolean;
  /** Timestamp stamped into the returned lock (defaults to now). */
  now?: string;
}

// ── Diff helpers ─────────────────────────────────────────────────────────────

/** Normalize a decimal string for comparison (`"0.0020"` === `"0.002"`); null-ish → null. */
function normNum(v?: string | null): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : String(n);
}

function tiersKey(t?: unknown): string {
  // `[]` is truthy: the API returns `tiers: []` on a flat price while a config
  // omits the field, so "[]" vs "" reported drift and bumped a version every sync.
  if (!t || (Array.isArray(t) && t.length === 0)) return "";
  return JSON.stringify(t);
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
    grantsEqual(v, p) &&
    (v.billingCycle ?? null) === (p.billingCycle ?? null)
  );
}

/**
 * Compare ALL grants, cycle and payment.
 *
 * Comparing only the cycle grant meant adding `on: "payment"` to a product that
 * already existed reported `skip` and applied nothing — the grant silently
 * never reached the tenant.
 */
function grantsEqual(v: Version, p: BillingProduct): boolean {
  const key = (g: { meter: string; amount: string; on: string }) =>
    `${g.meter}@${g.on}=${normNum(g.amount)}`;
  const remote = (v.grants ?? []).map(key).sort();
  const desired = versionGrants(p).map(key).sort();
  return remote.length === desired.length && remote.every((x, i) => x === desired[i]);
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

/** Deterministic JSON with sorted keys — stable across runs for fingerprinting. */
function canon(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`)
    .join(",")}}`;
}

/** Canonical fingerprint of a product's managed backend state (for drift detection). */
function productFingerprint(
  prod: Pick<Product, "name" | "type" | "pricingModel" | "currency">,
  version: Version | undefined,
  prices: Price[],
  idToKey: Map<string, string>,
): string {
  return canon({
    name: prod.name ?? null,
    type: prod.type ?? null,
    pricingModel: prod.pricingModel ?? null,
    currency: prod.currency ?? null,
    billingCycle: version?.billingCycle ?? null,
    basePrice: normNum(version?.basePrice),
    cycleGrant: normNum(versionCycleGrant(version)),
    prices: prices
      .map((pr) => ({
        meter: pr.meterId ? (idToKey.get(pr.meterId) ?? pr.meterId) : null,
        model: pr.model ?? null,
        unitAmount: normNum(pr.unitAmount),
        currency: pr.currency ?? null,
        tiers: pr.tiers ?? null,
      }))
      .sort((a, b) => priceKey(a.meter).localeCompare(priceKey(b.meter))),
  });
}

/** Re-read a product's current state and fingerprint it for the lock. */
async function snapshotProduct(
  infi: Infi,
  productId: string,
  meta: Pick<Product, "name" | "type" | "pricingModel" | "currency">,
  now: string,
): Promise<ProductLock> {
  const [versions, meters] = await Promise.all([
    infi.products.versions.list(productId),
    infi.products.meters.list(productId),
  ]);
  const cur = currentVersion(versions);
  const prices = cur ? await infi.products.prices.list(productId, cur.id!) : [];
  const idToKey = new Map(
    meters.filter((m) => m.id && m.name).map((m) => [m.id!, m.name!] as const),
  );
  return { state: productFingerprint(meta, cur, prices, idToKey), versionId: cur?.id, syncedAt: now };
}

/** Create + publish a new version with the config's prices. Shared by seed and bump. */
async function publishVersion(
  infi: Infi,
  productId: string,
  p: BillingProduct,
  meterIdByKey: Map<string, string | undefined>,
): Promise<void> {
  // The backend dropped product_versions.credits_per_cycle (migration 000098) and
  // now answers 422 "unrecognized field" for it, so the allowance goes over as a
  // meter grant. Sending the old field failed every sync, and with it bootstrap.
  const grants = versionGrants(p);
  const version = await infi.products.versions.create(productId, {
    billingCycle: p.billingCycle ?? null,
    basePrice: p.basePrice ?? null,
    ...(grants.length > 0 ? { grants } : {}),
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

/** Order-insensitive string-array equality (origins / redirect URIs / events). */
function arrEq(a?: string[], b?: string[]): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Canonical fingerprint of a webhook's managed backend state. */
function webhookFingerprint(w: Pick<WebhookEndpoint, "events" | "isActive">): string {
  return canon({ events: [...(w.events ?? [])].sort(), isActive: w.isActive ?? null });
}

/** Shared context threaded into the tenant-level reconcilers. */
interface ReconcileCtx {
  plan: boolean;
  force: boolean;
  now: string;
  prevLock?: SyncLock;
  lock: SyncLock;
  actions: SyncAction[];
  drift: DriftEntry[];
}

/** Reconcile webhooks by url: create missing, patch changed events/active. Never deletes/rotates; drift-guarded. */
async function reconcileWebhooks(infi: Infi, webhooks: BillingWebhook[], ctx: ReconcileCtx): Promise<void> {
  const existing = await infi.webhooks.list();
  ctx.lock.webhooks ??= {};
  for (const w of webhooks) {
    const match = existing.find((x: WebhookEndpoint) => x.url === w.url);
    if (!match) {
      ctx.actions.push({ action: "create", resource: "webhook", ref: w.url });
      let created: WebhookEndpoint | undefined;
      if (!ctx.plan) created = await infi.webhooks.create({ url: w.url, events: w.events });
      ctx.lock.webhooks[w.url] = {
        state: webhookFingerprint(created ?? { events: w.events, isActive: w.isActive }),
        syncedAt: ctx.now,
      };
      continue;
    }

    const prev = ctx.prevLock?.webhooks?.[w.url];
    const preState = webhookFingerprint(match);
    const drifted = Boolean(prev && prev.state !== preState);
    const patch: { events?: WebhookEventType[]; isActive?: boolean } = {};
    if (!arrEq(match.events, w.events)) patch.events = w.events;
    if (w.isActive !== undefined && match.isActive !== w.isActive) patch.isActive = w.isActive;
    const changed = Object.keys(patch);

    if (changed.length === 0) {
      ctx.actions.push({ action: "skip", resource: "webhook", ref: w.url });
      ctx.lock.webhooks[w.url] = { state: preState, syncedAt: ctx.now };
    } else if (drifted && !ctx.force) {
      ctx.actions.push({ action: "blocked", resource: "webhook", ref: w.url, detail: "changed in dashboard since last sync" });
      ctx.drift.push({ product: w.url, detail: `webhook ${changed.join(", ")} would overwrite a dashboard edit` });
      if (prev) ctx.lock.webhooks[w.url] = prev;
    } else {
      ctx.actions.push({ action: "update", resource: "webhook", ref: w.url, detail: changed.join(", ") });
      const updated = !ctx.plan && match.id ? await infi.webhooks.patch(match.id, patch) : { ...match, ...patch };
      ctx.lock.webhooks[w.url] = { state: webhookFingerprint(updated), syncedAt: ctx.now };
    }
  }
}

/**
 * Apply a billing config as desired state. Products are matched by
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
 *
 * Drift guard: pass the previous `lock` (from `infi.billing.lock.json`). If a
 * product's backend state changed since that lock (edited in the dashboard), an
 * `update`/`bump` is **blocked** rather than silently overwriting it — pass
 * `{ force: true }` to override, or reconcile with `infi pull`. The returned
 * `lock` is the fresh provenance to persist (unchanged in plan mode).
 */
export async function syncBilling(
  infi: Infi,
  config: BillingConfig,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  assertValidConfig(config);

  const plan = opts.plan ?? false;
  const force = opts.force ?? false;
  const now = opts.now ?? new Date().toISOString();
  const prevLock = opts.lock;
  const actions: SyncAction[] = [];
  const drift: DriftEntry[] = [];
  const lock: SyncLock = { version: 1, products: {} };
  const existingProducts = await infi.products.list();

  for (const p of config.products) {
    const name = p.name ?? p.key;
    // Prefer the natural key (unique per tenant); fall back to name for older tenants.
    const existing = existingProducts.find((x) => (x.key ? x.key === p.key : x.name === name));
    let productId = existing?.id;
    // Metadata we know for this product (updated as we go), for the post-sync snapshot.
    let meta: Pick<Product, "name" | "type" | "pricingModel" | "currency"> = existing ?? {
      name,
      type: p.type,
      pricingModel: p.pricingModel,
      currency: p.currency,
    };

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
        meta = created;
      }
    }

    // In plan mode without a real product id we can only report the parent create.
    if (!productId) continue;

    // Meters — read first (needed for fingerprinting and price resolution).
    const existingMeters = await infi.products.meters.list(productId);
    const meterIdByKey = new Map<string, string | undefined>(
      existingMeters.map((m) => [m.name ?? "", m.id]),
    );
    const idToKey = new Map(
      existingMeters.filter((m) => m.id && m.name).map((m) => [m.id!, m.name!] as const),
    );
    const meterByKey = new Map(existingMeters.map((m) => [m.name ?? "", m] as const));

    // Drift: has the backend changed since the last sync recorded in the lock?
    const versions = await infi.products.versions.list(productId);
    const current = currentVersion(versions);
    const currentPrices = current ? await infi.products.prices.list(productId, current.id!) : [];
    const prev = prevLock?.products[p.key];
    const preState = existing ? productFingerprint(existing, current, currentPrices, idToKey) : "";
    const drifted = Boolean(existing && prev && prev.state !== preState);

    // Product metadata — update when it drifted from config (guarded against dashboard drift).
    if (existing) {
      const patch = productPatch(existing, p);
      const changed = Object.keys(patch);
      if (changed.length > 0) {
        if (drifted && !force) {
          actions.push({ action: "blocked", resource: "product", ref: name, detail: "changed in dashboard since last sync" });
          drift.push({ product: p.key, detail: `product ${changed.join(", ")} would overwrite a dashboard edit` });
        } else {
          actions.push({ action: "update", resource: "product", ref: name, detail: changed.join(", ") });
          if (!plan) meta = await infi.products.update(productId, patch);
        }
      } else {
        actions.push({ action: "skip", resource: "product", ref: name });
      }
    }

    // Meters — create missing, update changed metadata (name/slug is immutable).
    for (const m of p.meters ?? []) {
      const cur = meterByKey.get(m.key);
      if (cur) {
        const patch: { displayName?: string; unit?: typeof m.unit; aggregation?: typeof m.aggregation } = {};
        const wantDisplay = m.displayName ?? m.key;
        if ((cur.displayName ?? "") !== wantDisplay) patch.displayName = wantDisplay;
        if (cur.unit !== m.unit) patch.unit = m.unit;
        if (cur.aggregation !== m.aggregation) patch.aggregation = m.aggregation;
        const changed = Object.keys(patch);
        if (changed.length > 0 && cur.id) {
          actions.push({ action: "update", resource: "meter", ref: `${name}/${m.key}`, detail: changed.join(", ") });
          if (!plan) await infi.products.meters.update(productId, cur.id, patch);
        } else {
          actions.push({ action: "skip", resource: "meter", ref: `${name}/${m.key}` });
        }
        continue;
      }
      actions.push({ action: "create", resource: "meter", ref: `${name}/${m.key}` });
      if (!plan) {
        const created = await infi.products.meters.create(productId, {
          name: m.key,
          displayName: m.displayName ?? m.key,
          unit: m.unit,
          aggregation: m.aggregation,
          // Any aggregation but `count` needs a field to read the number from, and
          // the API 422s without one. `track({ value })` writes `value`.
          ...(m.aggregation === "count" ? {} : { valueProperty: m.valueProperty ?? "value" }),
        });
        meterIdByKey.set(m.key, created.id);
      }
    }

    // Versions — seed the first one, or bump when the desired pricing drifted.
    let applied = !existing; // created products already seeded above (when not plan)
    if (!current) {
      actions.push({ action: "create", resource: "version", ref: name });
      if (!plan) {
        await publishVersion(infi, productId, p, meterIdByKey);
        applied = true;
      }
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
      const reasons: string[] = [];
      if (!versionFieldsEqual(current, p)) reasons.push("version fields");
      if (unresolvedMeter || !pricesEqual(currentPrices, desired)) reasons.push("prices");

      if (reasons.length > 0) {
        if (drifted && !force) {
          actions.push({ action: "blocked", resource: "version", ref: name, detail: "changed in dashboard since last sync" });
          drift.push({ product: p.key, detail: `version ${reasons.join(", ")} would supersede a dashboard edit` });
        } else {
          actions.push({ action: "bump", resource: "version", ref: name, detail: reasons.join(", ") });
          if (!plan) {
            await publishVersion(infi, productId, p, meterIdByKey);
            applied = true;
          }
        }
      } else {
        actions.push({ action: "skip", resource: "version", ref: name });
      }
    }

    // Grants ride on the version via publishVersion — both cycle and payment.
    for (const g of p.grants ?? []) {
      actions.push({
        action: "skip",
        resource: "grant",
        ref: `${name}/${g.meter}@${g.on}`,
        detail: `sent as a version grant (${g.amount})`,
      });
    }

    // Deliverable (link only in sync; file uploads go through presign/save).
    if (p.deliverable?.kind === "link") {
      actions.push({ action: "create", resource: "deliverable", ref: name });
      if (!plan) {
        await infi.products.deliverable.save(productId, { kind: "link", url: p.deliverable.url });
      }
    }

    // Lock: a blocked product keeps its prior entry (stays flagged until resolved);
    // otherwise record the post-sync state so the next run measures drift from here.
    const wasBlocked = drift.some((d) => d.product === p.key);
    if (plan) {
      if (prev) lock.products[p.key] = prev;
    } else if (wasBlocked) {
      if (prev) lock.products[p.key] = prev;
    } else if (applied) {
      lock.products[p.key] = await snapshotProduct(infi, productId, meta, now);
    } else {
      lock.products[p.key] = { state: preState, versionId: current?.id, syncedAt: now };
    }
  }

  // Platform config — webhooks (create + update, never delete). Tenant-level,
  // drift-guarded against the lock like products.
  const ctx: ReconcileCtx = { plan, force, now, prevLock, lock, actions, drift };
  if (config.webhooks?.length) await reconcileWebhooks(infi, config.webhooks, ctx);

  return { planned: plan, actions, drift, lock: plan ? (prevLock ?? lock) : lock };
}

/**
 * Snapshot the current backend state of every product in `config` into a lock,
 * without applying anything. Used by `infi pull` so a freshly pulled config +
 * lock reports no drift on the next `sync`.
 */
export async function buildLock(
  infi: Infi,
  config: BillingConfig,
  now?: string,
): Promise<SyncLock> {
  const t = now ?? new Date().toISOString();
  const products = await infi.products.list();
  const lock: SyncLock = { version: 1, products: {} };
  for (const p of config.products) {
    const name = p.name ?? p.key;
    const existing = products.find((x) => (x.key ? x.key === p.key : x.name === name));
    if (!existing?.id) continue;
    lock.products[p.key] = await snapshotProduct(infi, existing.id, existing, t);
  }

  if (config.webhooks?.length) {
    const whs = await infi.webhooks.list();
    lock.webhooks = {};
    for (const w of config.webhooks) {
      const m = whs.find((x: WebhookEndpoint) => x.url === w.url);
      if (m) lock.webhooks[w.url] = { state: webhookFingerprint(m), syncedAt: t };
    }
  }
  return lock;
}
