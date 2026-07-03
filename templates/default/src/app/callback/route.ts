import { Callback } from "@beinfi/nextjs";

export const GET = Callback({
  secretKey: process.env.INFI_SECRET_KEY!,
  baseUrl: process.env.INFI_API_URL,
  successUrl: "/onboarding",
  errorUrl: "/login",
});
