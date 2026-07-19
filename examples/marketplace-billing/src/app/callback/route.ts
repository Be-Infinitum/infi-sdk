import { Callback } from "@beinfi/nextjs";

export const GET = Callback({
  secretKey: process.env.INFI_SECRET_KEY!,
  apiUrl: process.env.INFI_API_URL,
  successUrl: "/",
});
