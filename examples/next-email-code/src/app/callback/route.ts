import { Callback } from "@beinfi/nextjs";

// The whole callback: exchange the hosted-flow `?code=…` → set the session cookie → redirect.
export const GET = Callback({
  secretKey: process.env.INFI_SECRET_KEY!,
  baseUrl: process.env.INFI_API_URL,
  successUrl: "/",
});
