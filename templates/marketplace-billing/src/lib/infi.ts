import { Infi } from "@beinfi/sdk";

/** Server-side Infi client. Uses the sandbox secret key + local API base. */
export const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!,
  baseUrl: process.env.INFI_API_URL,
});
