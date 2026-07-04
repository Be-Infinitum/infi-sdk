import { Infi } from "@beinfi/sdk";
import { PRODUCT_KEY } from "../../infi.billing.js";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "__APP_NAME__";
export const SLUG = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "__APP_SLUG__";
export { PRODUCT_KEY };
export const STARTER_CREDITS = "100";
export const APP_PORT = "__PORT__";
export const APP_ORIGIN = `http://localhost:${APP_PORT}`;

export const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!,
  baseUrl: process.env.INFI_API_URL,
  payBaseUrl: process.env.INFI_PAY_BASE_URL,
});

/** Public client for sandbox status (no secret key). */
export const publicInfi = new Infi({ baseUrl: process.env.INFI_API_URL });

export async function productId(): Promise<string> {
  const products = await infi.products.list();
  const product = products.find((p) => p.key === PRODUCT_KEY);
  if (!product?.id) {
    throw new Error("Product not seeded — run `bun run setup`");
  }
  return product.id;
}
