import { parseErrorResponse, type CompanyIntent } from "@beinfi/sdk";

export type ClaimRef = "lovable" | "mcp" | "cursor" | "cli";

export type ClaimableTenantCreateResponse = {
  id: string;
  status: "UNCLAIMED" | "CLAIMED";
  tenantSlug: string;
  productId: string;
  apiKeySecret: string;
  claimUrl: string;
  expiresAt: string;
};

export type ClaimableTenantPublicView = {
  id: string;
  status: "UNCLAIMED" | "CLAIMED";
  tenantSlug: string;
  productId?: string;
  ref: string;
  expiresAt: string;
  claimedAt?: string;
};

export type CreateClaimableOptions = {
  ref?: ClaimRef;
  /** Seed catalog from a company intent (backend may ignore until API ships). */
  intent?: CompanyIntent;
};

/**
 * Provision a claimable tenant — instant credentials the user can start with
 * immediately, then claim to own (neon.new-style). Public, no secret key.
 */
export async function createClaimable(
  baseUrl: string,
  refOrOpts: ClaimRef | CreateClaimableOptions = "cli",
): Promise<ClaimableTenantCreateResponse> {
  const opts: CreateClaimableOptions =
    typeof refOrOpts === "string" ? { ref: refOrOpts } : refOrOpts;
  const base = baseUrl.replace(/\/$/, "");
  const body: Record<string, string> = { ref: opts.ref ?? "cli" };
  if (opts.intent) body.intent = opts.intent;

  const res = await fetch(`${base}/public/v1/claimables`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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
