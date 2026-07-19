import { Callback } from "@beinfi/nextjs";

export const GET = Callback({
  secretKey: process.env.INFI_SECRET_KEY!,
  apiUrl: process.env.INFI_API_URL,
  successUrl: "/",
  // On a failed exchange, bounce back to the login page (with ?error/&message)
  // instead of landing the user on a raw JSON error.
  errorUrl: "/login",
});
