import type { Transport } from "../http.js";

const enc = encodeURIComponent;

/** The closed set of looks a shop may take. Refused by the API if you invent
 * one: the palette is closed so a shop can never be published unreadable. */
export interface StorefrontTheme {
  accent?:
    | "purple"
    | "teal"
    | "amber"
    | "rose"
    | "blue"
    | "green"
    | "brown"
    | "slate";
  mode?: "light" | "dark";
  layout?: "grid" | "list";
  whatsapp?: string;
  instagram?: string;
}

/** How a buyer receives what they bought. A `pickup` shop never asks them for
 * an address; `both` lets them choose at checkout. */
export type FulfillmentMode = "pickup" | "shipping" | "both";

export interface Storefront {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  logoObjectKey?: string | null;
  bannerUrl?: string | null;
  bannerObjectKey?: string | null;
  theme: StorefrontTheme;
  status: "active" | "disabled";
  fulfillmentMode: FulfillmentMode;
  pickupNote?: string | null;
  shippingFlatAmount?: string | null;
  requireAddress: boolean;
  createdAt: string;
}

/** A created shop plus the URL you actually send someone. */
export type StorefrontWithUrl = Storefront & { url: string };

export interface StorefrontInput {
  name?: string;
  /** The public address: 3-40 chars, lowercase, digits and single dashes,
   * unique across Infi. A taken one is a 409, not a crash. */
  slug?: string;
  description?: string | null;
  logoObjectKey?: string | null;
  bannerObjectKey?: string | null;
  theme?: StorefrontTheme;
  status?: "active" | "disabled";
  fulfillmentMode?: FulfillmentMode;
  pickupNote?: string | null;
  /** Flat shipping. "0" is free, null is "arranged outside". Refused on a
   * pickup-only shop, which has nothing to ship. */
  shippingFlatAmount?: string | null;
  requireAddress?: boolean;
}

export interface ShelfItem {
  productId: string;
  visible?: boolean;
  /** On the shelf physically — a boolean, not a count. There is no stock. */
  availableOnsite?: boolean;
}

export interface ShelfRow {
  productId: string;
  name: string;
  imageUrl?: string | null;
  position: number;
  visible: boolean;
  availableOnsite: boolean;
  productStatus: "active" | "archived";
}

export interface PresignedImage {
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}

/**
 * Storefronts — a public shop page for products you already have.
 *
 * A link sells one product; a storefront is a place a buyer picks several
 * things from, under its own address and its own look. You do not build a page:
 * you choose which products are on the shelf and what the shop looks like, and
 * the URL is ready to send.
 */
export class StorefrontsResource {
  constructor(
    private readonly t: Transport,
    /** Hosted shop origin, so create() can hand back a ready URL. */
    private readonly appBase: string,
  ) {}

  /** Create a shop. The slug is the public address — a taken one throws 409. */
  async create(
    input: StorefrontInput & { name: string; slug: string },
    idempotencyKey?: string,
  ): Promise<StorefrontWithUrl> {
    const store = await this.t.request<Storefront>("POST", "/storefronts", {
      requireSecret: true,
      idempotencyKey,
      body: input,
    });
    return { ...store, url: this.urlFor(store.slug) };
  }

  async list(): Promise<StorefrontWithUrl[]> {
    const res = await this.t.request<{ storefronts?: Storefront[] }>(
      "GET",
      "/storefronts",
      { requireSecret: true },
    );
    return (res.storefronts ?? []).map((s) => ({ ...s, url: this.urlFor(s.slug) }));
  }

  async get(id: string): Promise<StorefrontWithUrl> {
    const store = await this.t.request<Storefront>(
      "GET",
      `/storefronts/${enc(id)}`,
      { requireSecret: true },
    );
    return { ...store, url: this.urlFor(store.slug) };
  }

  /**
   * Patch a shop. Absent fields keep their value.
   *
   * `status: "disabled"` takes it off the air immediately and is reversible.
   * There is no delete: a shop whose address is already on someone's phone or
   * printed on a counter cannot be un-printed.
   */
  async update(
    id: string,
    input: StorefrontInput,
    idempotencyKey?: string,
  ): Promise<StorefrontWithUrl> {
    const store = await this.t.request<Storefront>(
      "PATCH",
      `/storefronts/${enc(id)}`,
      { requireSecret: true, idempotencyKey, body: input },
    );
    return { ...store, url: this.urlFor(store.slug) };
  }

  /** The shelf as you edit it: hidden rows and archived products included. */
  async shelf(id: string): Promise<ShelfRow[]> {
    const res = await this.t.request<{ items?: ShelfRow[] }>(
      "GET",
      `/storefronts/${enc(id)}/items`,
      { requireSecret: true },
    );
    return res.items ?? [];
  }

  /**
   * Replace the shelf with this ordered list — the order IS the array order.
   * A product that is not yours is a 404; nothing partial is written.
   */
  async setShelf(
    id: string,
    items: ShelfItem[],
    idempotencyKey?: string,
  ): Promise<ShelfRow[]> {
    const res = await this.t.request<{ items?: ShelfRow[] }>(
      "PUT",
      `/storefronts/${enc(id)}/items`,
      { requireSecret: true, idempotencyKey, body: { items } },
    );
    return res.items ?? [];
  }

  /**
   * Presign an image upload — shop logo, shop banner or product photo, all the
   * same call. PUT the bytes to `uploadUrl`, then attach `objectKey` with
   * `update({ logoObjectKey })` or `products.update({ imageObjectKey })`.
   *
   * PNG, JPEG and WebP only, 2 MB max. SVG is refused: it runs script when
   * served inline from our origin.
   */
  async presignImage(
    contentType: string,
    sizeBytes: number,
  ): Promise<PresignedImage> {
    return this.t.request<PresignedImage>("POST", "/catalog/images/presign", {
      requireSecret: true,
      body: { contentType, sizeBytes },
    });
  }

  /** The public address of a shop. */
  urlFor(slug: string): string {
    return `${this.appBase}/store/${enc(slug)}`;
  }
}
