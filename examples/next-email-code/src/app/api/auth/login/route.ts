import { Login } from "@beinfi/nextjs";

// Server-side login block: redirect the browser to the hosted email-code login.
export const GET = Login({
  slug: process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "dev",
  appUrl: process.env.NEXT_PUBLIC_INFI_AUTH_BASE_URL ?? process.env.NEXT_PUBLIC_INFI_API_URL,
  redirectTo: "/callback",
});
