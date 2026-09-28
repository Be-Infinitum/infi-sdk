import "server-only";
import { getStorefront, type StorefrontItem } from "@beinfi/elements-core";
import { apiUrl, getInfi, storeSlug } from "./infi";

export type StoreProduct = StorefrontItem & { linkToken?: string };

/**
 * The shelf as a buyer sees it: prices from the server, never computed here.
 * Each product is paid through its payment link, inside the Infi checkout frame.
 */
export async function listProducts(): Promise<{ name: string; products: StoreProduct[] }> {
  const store = await getStorefront(apiUrl(), storeSlug);
  const products = await Promise.all(
    store.items.map(async (item) => {
      // A link pins the version it was made for; the newest live one sells the
      // current price.
      const links = (await getInfi().links.list(item.productId))
        .filter((l) => l.active !== false && !l.revokedAt)
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
      return { ...item, linkToken: links[0]?.token };
    }),
  );
  return { name: store.name, products };
}

export async function getProduct(productId: string): Promise<StoreProduct | undefined> {
  const { products } = await listProducts();
  return products.find((p) => p.productId === productId);
}

export function formatPrice(price: string | null | undefined, currency: string): string {
  if (!price) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(price));
}
