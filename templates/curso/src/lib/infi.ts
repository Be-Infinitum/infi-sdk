import "server-only";
import { Infi } from "@beinfi/sdk";
import company from "../../infi.company";

/**
 * The server's Infi client. The sk_ stays on the server: never import this
 * from a "use client" file, never expose it as NEXT_PUBLIC_*.
 *
 * Built on first use, so `next build` does not need a key.
 */
let client: Infi | undefined;

export function getInfi(): Infi {
  if (client) return client;
  const key = process.env.INFI_SECRET_KEY;
  if (!key?.startsWith("sk_")) {
    throw new Error(
      "INFI_SECRET_KEY is missing or not a secret key. Run `infi login` in this folder — it writes .env.local.",
    );
  }
  client = new Infi({ secretKey: key, apiUrl: process.env.INFI_API_URL });
  return client;
}

/** sandbox or live, from the key — the checkout frame must charge the same one. */
export function environment(): "sandbox" | "production" {
  // From the prefix alone: the layout calls this on every page, including the
  // ones Next prerenders at build time, where there may be no key.
  return process.env.INFI_SECRET_KEY?.startsWith("sk_live_") ? "production" : "sandbox";
}

/** The merchant's slug (`/pay/{slug}`), written by `infi login`. */
export function tenantSlug(): string {
  return process.env.INFI_TENANT_SLUG ?? "";
}

/** The store's slug, as the manifest (and `infi sync`) set it. */
export const storeSlug = company.storefront?.slug ?? "";

export function apiUrl(): string {
  const fallback = getInfi().mode === "live" ? "https://api.beinfi.com" : "https://api-sandbox.beinfi.com";
  return (process.env.INFI_API_URL ?? fallback).replace(/\/$/, "");
}
