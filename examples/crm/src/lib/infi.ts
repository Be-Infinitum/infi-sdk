import { Infi } from "@beinfi/sdk";

/** App/merchant slug (hosted login + hosted checkout /pay page). */
export const SLUG = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "crm-demo";
/** Billing product key seeded by `bun run setup`. */
export const PRODUCT_KEY = "crm";

/** Server-side Infi client. Uses the sandbox secret key + local API base. */
export const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!,
  baseUrl: process.env.INFI_API_URL,
  // Hosted checkout (/pay/...) is rendered by the Infi frontend, so the pay link
  // returned by checkout() points here. Local: the front on :3000.
  payBaseUrl: process.env.INFI_PAY_BASE_URL,
});
