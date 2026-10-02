import "server-only";
import { getStorefront, type PublicStorefront } from "@beinfi/elements";
import { apiUrl, getInfi, storeSlug } from "./infi";

/** The shelf as a buyer sees it: prices from the server, never computed here. */
export function getStore(): Promise<PublicStorefront> {
  return getStorefront(apiUrl(), storeSlug);
}

/**
 * The payment link a product is paid through, inside the Infi checkout. A
 * link pins the version it was made for; the newest live one sells the
 * current price.
 */
export async function linkFor(productId: string): Promise<string | undefined> {
  const links = (await getInfi().links.list(productId))
    .filter((l) => l.active !== false && !l.revokedAt)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return links[0]?.token;
}
