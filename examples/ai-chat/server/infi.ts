import { Infi } from "@beinfi/sdk";

export const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!,
  apiUrl: process.env.INFI_API_URL,
  appUrl: process.env.INFI_AUTH_BASE_URL,
  appUrl: process.env.INFI_PAY_BASE_URL,
});

export const SLUG = process.env.INFI_SLUG ?? "ai-chat-demo";
export const PRODUCT_KEY = "ai-chat";
export const STARTER_CREDITS = process.env.STARTER_CREDITS ?? "2000";
export const PACK_CREDITS = process.env.PACK_CREDITS ?? "50000";
export const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

let productIdCache: string | null = null;

/** Resolve the ai-chat product id (by key) once. */
export async function aiChatProductId(): Promise<string> {
  if (productIdCache) return productIdCache;
  const products = await infi.products.list();
  const p = products.find((x) => x.key === PRODUCT_KEY);
  if (!p?.id) throw new Error(`Product "${PRODUCT_KEY}" not seeded — run \`bun run seed\`.`);
  productIdCache = p.id;
  return p.id;
}
