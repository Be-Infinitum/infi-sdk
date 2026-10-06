import "server-only";
import { createInfiAuth } from "@beinfi/sdk";
import { headers } from "next/headers";

/**
 * The store's login: "Entrar com Infi". Anyone signs in on Infi's page (an
 * e-mailed code or Google, bought or not) and comes back here; the session is
 * an HttpOnly cookie on this site. `infi sync` registers this site and writes
 * INFI_CLIENT_ID; in production set INFI_SITE_URL if a proxy rewrites Host.
 */
export const auth = createInfiAuth();

/** Who is signed in on this request, read fresh. null when nobody is. */
export async function getBuyer() {
  return auth.getBuyer(await headers());
}

/** The raw token, for <PortalElement token> only. */
export async function getBuyerToken() {
  return auth.getToken(await headers());
}
