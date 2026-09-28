/**
 * The store, read the way a buyer reads it: public, by slug, prices computed
 * by the server (decisoes.md E2 — no pk_ in v1). Show these numbers; never
 * compute a price on the front.
 */
export interface StorefrontItem {
  productId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  currency: string;
  billingCycle?: string | null;
  requiresShipping: boolean;
  availableOnsite: boolean;
}

export interface PublicStorefront {
  slug: string;
  name: string;
  description?: string | null;
  items: StorefrontItem[];
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
