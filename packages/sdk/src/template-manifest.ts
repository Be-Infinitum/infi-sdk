/**
 * Template manifest — what a template (Ecommerce first) declares on top of the
 * plain company config: a schema version the CLI must know, the template id
 * every product key is prefixed with, coupons, the store, and delivery files.
 *
 * Decisions (Caio, 2026-09-26, docs/product-specs/templates/decisoes.md):
 * G4 keys prefixed by the template, collisions shown and asked; G8 a taken
 * store slug comes back as an editable suggestion; G9 an unknown
 * `schemaVersion` is refused with "update the CLI"; B7 one lock per mode;
 * B8 live sync takes catalog, store and files, `sandboxOnly` coupons stay.
 */
import type { Infi } from "./client.js";
import { InfiError } from "./errors.js";
import type { StorefrontWithUrl } from "./resources/storefronts.js";

/** Manifest versions this SDK understands. A newer one is refused, never half-applied. */
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;
export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

export interface TemplateMeta {
  /** Template id, e.g. `ecommerce`. Every product key starts with `<id>/`. */
  id: string;
  /** Template release, e.g. `1.0.0`. A new one arrives as a changelog, never a rewrite. */
  version: string;
}

export interface BillingCoupon {
  /** `^[A-Z0-9_-]{3,32}$`. The code is the natural key: terms never change under it. */
  code: string;
  percentOff: string;
  duration: "once" | "repeating" | "forever";
  durationInCycles?: number;
  maxRedemptions?: number;
  /** Test discount: created on sandbox, never synced to live (B8). */
  sandboxOnly?: boolean;
}

export interface BillingStorefront {
  /** Public address, unique across Infi. A taken one is offered back as a suggestion (G8). */
  slug: string;
  name: string;
  description?: string;
  /** Product keys on the shelf, in order. */
  products: string[];
  /** Digital goods have nothing to ship. */
  fulfillmentMode?: "pickup" | "shipping" | "both";
}

/** A file delivered after payment, uploaded from the project by `infi sync`. */
export interface FileDeliverable {
  kind: "file";
  /** Path relative to the manifest, e.g. `./assets/ebook.pdf`. */
  path: string;
  fileName?: string;
  contentType?: string;
}

/** What the CLI hands sync for a file deliverable: the bytes and their digest. */
export interface DeliverableFile {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  sha256: string;
}

export class SchemaVersionError extends Error {
  constructor(readonly found: unknown) {
    super(
      `This manifest has schemaVersion ${JSON.stringify(found)}, which this CLI does not know ` +
        `(it knows ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}). Update the CLI: npm i -g @beinfi/cli@latest`,
    );
    this.name = "SchemaVersionError";
  }
}

export interface ManifestShape {
  schemaVersion?: number;
  template?: TemplateMeta;
  products: { key: string; deliverable?: { kind: string } }[];
  coupons?: BillingCoupon[];
  storefront?: BillingStorefront;
}

/**
 * Refuse, before anything is written, a manifest this CLI cannot apply whole:
 * an unknown schema, a template product key without its prefix, a store that
 * shelves a product the manifest does not declare, a coupon code the API would
 * refuse.
 */
export function assertValidManifest(m: ManifestShape): void {
  if (m.template || m.schemaVersion !== undefined) {
    if (!(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(m.schemaVersion as number)) {
      throw new SchemaVersionError(m.schemaVersion);
    }
  }
  if (m.template) {
    const prefix = `${m.template.id}/`;
    for (const p of m.products) {
      if (!p.key.startsWith(prefix)) {
        throw new Error(
          `products: "${p.key}" must start with "${prefix}" — template keys are prefixed so a second ` +
            `template never collides with the first.`,
        );
      }
    }
  }
  const keys = new Set(m.products.map((p) => p.key));
  for (const k of m.storefront?.products ?? []) {
    if (!keys.has(k)) throw new Error(`storefront.products: "${k}" is not a product in this manifest.`);
  }
  if (m.storefront && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.storefront.slug)) {
    throw new Error(`storefront.slug: "${m.storefront.slug}" must be lowercase letters, digits and single dashes.`);
  }
  for (const c of m.coupons ?? []) {
    if (!/^[A-Z0-9_-]{3,32}$/.test(c.code)) {
      throw new Error(`coupons: "${c.code}" must match ^[A-Z0-9_-]{3,32}$.`);
    }
    if (c.duration === "repeating" && !c.durationInCycles) {
      throw new Error(`coupons: "${c.code}" is repeating and needs durationInCycles.`);
    }
  }
}

/** The mode a key belongs to — the lock and the live scope follow it (B7, B8). */
export function modeOfKey(secretKey: string | undefined): "sandbox" | "live" {
  return secretKey?.startsWith("sk_live_") ? "live" : "sandbox";
}

/** A free slug to offer when the wanted one is taken (G8): editable, never applied silently. */
export function suggestSlug(slug: string, random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `${slug.slice(0, 35)}-${suffix}`;
}

/** A template product key that already exists in the tenant and this sync did not create. */
export interface KeyCollision {
  key: string;
  productId: string;
  /** Field → [what the tenant has, what the template declares]. */
  diff: Record<string, [unknown, unknown]>;
}

/** The answer to a collision: take the existing product over, or seed under another key. */
export type CollisionAnswer = { action: "adopt" } | { action: "rename"; key: string } | { action: "skip" };

export interface EntityLockLite {
  state: string;
  syncedAt: string;
}

export interface StorefrontLock extends EntityLockLite {
  id: string;
  slug: string;
}

type Action = {
  action: "create" | "skip" | "update" | "blocked";
  resource: "coupon" | "storefront" | "deliverable";
  ref: string;
  detail?: string;
};

function couponTerms(c: {
  percentOff?: string | null;
  duration?: string | null;
  durationInCycles?: number | null;
  maxRedemptions?: number | null;
}): string {
  return JSON.stringify([
    Number(c.percentOff ?? 0),
    c.duration ?? "",
    c.durationInCycles ?? null,
    c.maxRedemptions ?? null,
  ]);
}

/**
 * Coupons: created when missing; skipped when the same; blocked when the code
 * exists with other terms (a code's terms never change — give it a new code).
 * On live, `sandboxOnly` coupons are skipped (B8).
 */
export async function reconcileCoupons(
  infi: Infi,
  coupons: BillingCoupon[],
  opts: { plan: boolean; mode: "sandbox" | "live"; now: string },
): Promise<{ actions: Action[]; lock: Record<string, EntityLockLite> }> {
  const actions: Action[] = [];
  const lock: Record<string, EntityLockLite> = {};
  const existing = await infi.coupons.list();
  for (const c of coupons) {
    if (opts.mode === "live" && c.sandboxOnly) {
      actions.push({ action: "skip", resource: "coupon", ref: c.code, detail: "sandboxOnly: stays in sandbox" });
      continue;
    }
    const cur = existing.find((x) => (x.code ?? "").toUpperCase() === c.code.toUpperCase());
    if (cur) {
      if (couponTerms(cur) === couponTerms(c)) {
        actions.push({ action: "skip", resource: "coupon", ref: c.code });
        lock[c.code] = { state: couponTerms(c), syncedAt: opts.now };
      } else {
        actions.push({
          action: "blocked",
          resource: "coupon",
          ref: c.code,
          detail: "exists with other terms; a coupon's terms never change — use a new code",
        });
      }
      continue;
    }
    actions.push({ action: "create", resource: "coupon", ref: c.code });
    if (!opts.plan) {
      await infi.coupons.create({
        code: c.code,
        percentOff: c.percentOff,
        duration: c.duration,
        durationInCycles: c.durationInCycles ?? null,
        maxRedemptions: c.maxRedemptions ?? null,
      });
      lock[c.code] = { state: couponTerms(c), syncedAt: opts.now };
    }
  }
  return { actions, lock };
}

/**
 * The store: created with the wanted slug, or found by the slug the lock
 * remembers; its shelf set to the manifest's products. A slug taken by someone
 * else is offered back as a suggestion through `onSlugTaken` (G8); without an
 * answer the store is blocked with the suggestion in the detail.
 */
export async function reconcileStorefront(
  infi: Infi,
  store: BillingStorefront,
  productIds: Map<string, string>,
  opts: {
    plan: boolean;
    now: string;
    prev?: StorefrontLock;
    onSlugTaken?: (slug: string, suggestion: string) => Promise<string | null>;
  },
): Promise<{ actions: Action[]; lock?: StorefrontLock; slug: string }> {
  const actions: Action[] = [];
  const mine = await infi.storefronts.list();
  let current: StorefrontWithUrl | undefined =
    (opts.prev && mine.find((s) => s.id === opts.prev!.id)) || mine.find((s) => s.slug === store.slug);
  let slug = current?.slug ?? store.slug;
  if (!current) {
    actions.push({ action: "create", resource: "storefront", ref: slug });
    if (opts.plan) return { actions, slug };
    for (let attempt = 0; attempt < 3 && !current; attempt++) {
      try {
        current = await infi.storefronts.create({
          name: store.name,
          slug,
          description: store.description,
          fulfillmentMode: store.fulfillmentMode ?? "pickup",
          status: "active",
        });
      } catch (err) {
        if (!(err instanceof InfiError) || err.status !== 409) throw err;
        const suggestion = suggestSlug(store.slug);
        const chosen = opts.onSlugTaken ? await opts.onSlugTaken(slug, suggestion) : null;
        if (!chosen) {
          actions.push({
            action: "blocked",
            resource: "storefront",
            ref: slug,
            detail: `slug "${slug}" is taken; try "${suggestion}" (storefront.slug)`,
          });
          return { actions, slug };
        }
        slug = chosen;
      }
    }
    if (!current) return { actions, slug };
  } else {
    actions.push({ action: "update", resource: "storefront", ref: slug, detail: "shelf" });
  }
  const items = store.products
    .map((k) => productIds.get(k))
    .filter((id): id is string => Boolean(id))
    .map((productId) => ({ productId, visible: true }));
  if (!opts.plan && current) await infi.storefronts.setShelf(current.id, items);
  return {
    actions,
    slug,
    lock: current
      ? { id: current.id, slug: current.slug, state: JSON.stringify(items.map((i) => i.productId)), syncedAt: opts.now }
      : undefined,
  };
}

/**
 * A file deliverable: uploaded (presign → PUT → save) only when its digest
 * differs from what the lock remembers, so a sync that changed nothing moves
 * no bytes.
 */
export async function syncFileDeliverable(
  infi: Infi,
  productId: string,
  file: DeliverableFile,
  opts: { plan: boolean; previousHash?: string; fetchImpl?: typeof fetch },
): Promise<{ action: Action; hash: string }> {
  const ref = file.fileName;
  if (opts.previousHash === file.sha256) {
    return { action: { action: "skip", resource: "deliverable", ref }, hash: file.sha256 };
  }
  if (!opts.plan) {
    let upload;
    try {
      upload = await infi.products.deliverable.presign(productId, {
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.bytes.byteLength,
      });
    } catch (err) {
      // Storage down (503): the rest of the store still syncs; the file is
      // sent on the next `infi sync` — the lock keeps no hash for it.
      if (err instanceof InfiError && err.status === 503) {
        return {
          action: { action: "blocked", resource: "deliverable", ref, detail: "file storage unavailable; run infi sync again later" },
          hash: opts.previousHash ?? "",
        };
      }
      throw err;
    }
    const put = await (opts.fetchImpl ?? fetch)(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.contentType },
      body: file.bytes as unknown as BodyInit,
    });
    if (!put.ok) throw new Error(`deliverable upload for ${file.fileName} failed: HTTP ${put.status}`);
    await infi.products.deliverable.save(productId, {
      kind: "file",
      objectKey: upload.objectKey,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.bytes.byteLength,
    });
  }
  return {
    action: { action: opts.previousHash ? "update" : "create", resource: "deliverable", ref },
    hash: file.sha256,
  };
}
