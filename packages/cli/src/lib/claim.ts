import { parseErrorResponse } from "@beinfi/sdk";

export type ClaimRef = "lovable" | "mcp" | "cursor" | "cli";

export type ClaimableTenantCreateResponse = {
  id: string;
  status: "UNCLAIMED" | "CLAIMED";
  tenantSlug: string;
  productId: string;
  appSlug: string;
  apiKeySecret: string;
  claimUrl: string;
  expiresAt: string;
};

export type ClaimableTenantPublicView = {
  id: string;
  status: "UNCLAIMED" | "CLAIMED";
  tenantSlug: string;
  productId?: string;
  appSlug: string;
  ref: string;
  expiresAt: string;
  claimedAt?: string;
};

/**
 * Provision a claimable tenant — instant credentials the user can start with
 * immediately, then claim to own (neon.new-style). Public, no secret key. Lives
 * in the CLI because provisioning is a dev-time/onboarding concern (ADR 0001),
 * and "sandbox" now means only test-vs-live mode (backend ADR 0005).
 */
export async function createClaimable(
  baseUrl: string,
  ref: ClaimRef = "cli",
): Promise<ClaimableTenantCreateResponse> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/public/v1/claimables`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ref }),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return (await res.json()) as ClaimableTenantCreateResponse;
}

/** Public claimable-tenant status (no secrets). */
export async function getClaimable(
  baseUrl: string,
  claimableId: string,
): Promise<ClaimableTenantPublicView> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/public/v1/claimables/${encodeURIComponent(claimableId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return (await res.json()) as ClaimableTenantPublicView;
}
