import type { Infi } from "./client.js";
import type {
  App,
  CreateProductRequest,
  Price,
  PriceInput,
  Product,
  UpdateAppRequest,
  Version,
  WebhookEndpoint,
} from "./types.js";

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

export interface BillingApp {
  /** Stable natural key — the slug end-users log into (unique per tenant). */
  slug: string;
  name: string;
  allowedOrigins?: string[];
  redirectUris?: string[];
  sessionMode?: "infi" | "byo";
}

export interface BillingWebhook {
  /** Stable natural key — the delivery URL. */
  url: string;
  events: string[];
  isActive?: boolean;
}

export interface BillingConfig {
  products: BillingProduct[];
  /** Identity apps (slug, origins, redirect URIs, session mode). */
  apps?: BillingApp[];
  /** Webhook endpoints (url + subscribed events). */
  webhooks?: BillingWebhook[];
}

/** Identity helper for authoring a typed billing config. */
export function defineBilling(config: BillingConfig): BillingConfig {
  return config;
}

export interface SyncAction {
  action: "create" | "skip" | "update" | "bump" | "blocked";
  resource: "product" | "meter" | "version" | "price" | "deliverable" | "app" | "webhook";
  ref: string;
  /** Human-readable reason for an update/bump/blocked (e.g. changed fields, drift). */
  detail?: string;
}

/** Per-product provenance recorded after a sync — the "config versioning" lockfile. */
export interface ProductLock {
  /** Canonical fingerprint of the backend state this product had after the sync. */
  state: string;
  /** Published version id at that time. */
  versionId?: string;
  syncedAt: string;
}

/** `infi.billing.lock.json` — what the last sync applied, per product key. */
export interface SyncLock {
  version: 1;
  products: Record<string, ProductLock>;
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
    creditsPerCycle: normNum(version?.creditsPerCycle),
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

/** Order-insensitive string-array equality (origins / redirect URIs / events). */
function arrEq(a?: string[], b?: string[]): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function appPatch(existing: App, a: BillingApp): UpdateAppRequest {
  const patch: UpdateAppRequest = {};
  if (existing.name !== a.name) patch.name = a.name;
  if (a.allowedOrigins && !arrEq(existing.allowedOrigins, a.allowedOrigins)) patch.allowedOrigins = a.allowedOrigins;
  if (a.redirectUris && !arrEq(existing.redirectUris, a.redirectUris)) patch.redirectUris = a.redirectUris;
  if (a.sessionMode && existing.sessionMode !== a.sessionMode) patch.sessionMode = a.sessionMode;
  return patch;
}

/** Reconcile identity apps by slug: create missing, update changed. Never deletes. */
async function reconcileApps(
  infi: Infi,
  apps: BillingApp[],
  plan: boolean,
  actions: SyncAction[],
): Promise<void> {
  const existing = await infi.apps.list();
  for (const a of apps) {
    const match = existing.find((x) => x.slug === a.slug);
    if (!match) {
      actions.push({ action: "create", resource: "app", ref: a.slug });
      if (!plan) {
        await infi.apps.create({
          slug: a.slug,
          name: a.name,
          allowedOrigins: a.allowedOrigins,
          redirectUris: a.redirectUris,
          sessionMode: a.sessionMode,
        });
      }
      continue;
    }
    const patch = appPatch(match, a);
    const changed = Object.keys(patch);
    if (changed.length > 0) {
      actions.push({ action: "update", resource: "app", ref: a.slug, detail: changed.join(", ") });
      if (!plan && match.id) await infi.apps.update(match.id, patch);
    } else {
      actions.push({ action: "skip", resource: "app", ref: a.slug });
    }
  }
}

/** Reconcile webhook endpoints by url: create missing, patch changed events/active. Never deletes or rotates. */
async function reconcileWebhooks(
  infi: Infi,
  webhooks: BillingWebhook[],
  plan: boolean,
  actions: SyncAction[],
): Promise<void> {
  const existing = await infi.webhooks.list();
  for (const w of webhooks) {
    const match = existing.find((x: WebhookEndpoint) => x.url === w.url);
    if (!match) {
      actions.push({ action: "create", resource: "webhook", ref: w.url });
      if (!plan) await infi.webhooks.create({ url: w.url, events: w.events });
      continue;
    }
    const patch: { events?: string[]; isActive?: boolean } = {};
    if (!arrEq(match.events, w.events)) patch.events = w.events;
    if (w.isActive !== undefined && match.isActive !== w.isActive) patch.isActive = w.isActive;
    const changed = Object.keys(patch);
    if (changed.length > 0) {
      actions.push({ action: "update", resource: "webhook", ref: w.url, detail: changed.join(", ") });
      if (!plan && match.id) await infi.webhooks.patch(match.id, patch);
    } else {
      actions.push({ action: "skip", resource: "webhook", ref: w.url });
    }
  }
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

    // Meters — create any missing, keyed by (product, name).
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

  // Platform config — apps + webhooks (create + update, never delete). Tenant-level.
  if (config.apps?.length) await reconcileApps(infi, config.apps, plan, actions);
  if (config.webhooks?.length) await reconcileWebhooks(infi, config.webhooks, plan, actions);

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
  return lock;
}
