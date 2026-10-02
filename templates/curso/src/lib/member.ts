import "server-only";
import { createPortalClient, PortalError, type PortalClient } from "@beinfi/elements";
import { cookies } from "next/headers";
import { apiUrl, tenantSlug } from "./infi";

/** The student's buyer token lives here: httpOnly, first-party, never in a URL or localStorage. */
export const TOKEN_COOKIE = "infi_bt";

/**
 * The member area's reads, on THIS server, with the student's token. Infi
 * decides what is available, locked or not owned; a page renders only what
 * came back, so a lesson never renders for someone without access.
 */
export async function memberPortal(): Promise<PortalClient | null> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  return createPortalClient({ apiUrl: apiUrl(), slug: tenantSlug(), token });
}

/** The token was signed out, expired or revoked: the page asks for a login again. */
export function sessionEnded(err: unknown): boolean {
  return err instanceof PortalError && err.status === 401;
}

export function notFoundError(err: unknown): boolean {
  return err instanceof PortalError && err.status === 404;
}

/** Where Discord sends the student back; register it in Infi's Discord app for your domain. */
export function discordRedirectUri(): string {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/membros/discord/voltar`;
}
