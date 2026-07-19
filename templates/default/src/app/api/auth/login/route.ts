import { Login } from "@beinfi/nextjs";

export const GET = Login({
  slug: process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "__APP_SLUG__",
  appUrl: process.env.NEXT_PUBLIC_INFI_AUTH_BASE_URL,
  redirectTo: "/callback",
});
