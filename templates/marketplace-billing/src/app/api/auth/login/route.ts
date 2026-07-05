import { Login } from "@beinfi/nextjs";

export const GET = Login({
  slug: process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "marketplace-demo",
  authBaseUrl: process.env.NEXT_PUBLIC_INFI_AUTH_BASE_URL,
  redirectTo: "/callback",
});
