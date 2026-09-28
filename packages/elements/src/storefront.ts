import type { Appearance } from "./appearance.js";

/** An image (uploaded to Infi) or a video link (YouTube, Vimeo, any https). */
export interface ProductMedia {
  type: "image" | "video";
  url: string;
  objectKey?: string;
  alt?: string | null;
}

export interface ProductFaq {
  question: string;
  answer: string;
}

/** What the product page shows on top of name and price (backend §3). */
export interface ProductPageFields {
  media?: ProductMedia[] | null;
  faq?: ProductFaq[] | null;
  /** null = the element's default ("Comprar" / "Assinar"). */
  purchaseButtonText?: string | null;
  guaranteeDays?: number | null;
}

/**
 * The store, read the way a buyer reads it: public, by slug, prices computed
 * by the server (decisoes.md E2 — no pk_ in v1). Show these numbers; never
 * compute a price on the front.
 */
export interface StorefrontItem extends ProductPageFields {
  productId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  currency: string;
  billingCycle?: string | null;
  requiresShipping: boolean;
  availableOnsite: boolean;
  /** Effective accent (product → business), already resolved by the server. */
  accentColor?: string | null;
}

export interface PublicStorefront {
  slug: string;
  name: string;
  description?: string | null;
  items: StorefrontItem[];
  /** The business's effective appearance. */
  appearance?: Appearance | null;
  [key: string]: unknown;
}

/**
 * `GET /pay/links/{token}` (and `/pay/{slug}/links/{token}`): what a payment
 * link sells, as the checkout reads it. `appearance` is resolved link →
 * product → business.
 */
export interface PublicPaymentLink {
  merchant: { slug: string; name: string; logoUrl?: string };
  product: ProductPageFields & {
    name: string;
    type: "agent" | "item";
    pricingModel: "subscription" | "one_time" | "usage" | "prepaid";
    price?: string;
    currency: string;
    description?: string | null;
  };
  testMode: boolean;
  cardEnabled: boolean;
  cryptoEnabled: boolean;
  successUrl?: string | null;
  cancelUrl?: string | null;
  appearance?: Appearance | null;
  [key: string]: unknown;
}

export async function getStorefront(
  apiUrl: string,
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicStorefront> {
  const res = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/public/storefronts/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`storefront ${slug}: HTTP ${res.status}`);
  return (await res.json()) as PublicStorefront;
}

/** The public API host for a mode (sandbox default). */
export function apiBaseFor(mode: "sandbox" | "live", override?: string): string {
  if (override) return override.replace(/\/$/, "");
  return mode === "live" ? "https://api.beinfi.com" : "https://api-sandbox.beinfi.com";
}
