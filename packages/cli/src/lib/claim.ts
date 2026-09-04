import { InfiError, parseErrorResponse } from "@beinfi/sdk";

export type ClaimRef = "lovable" | "mcp" | "cursor" | "cli";

export type ClaimableTenantCreateResponse = {
  id: string;
  status: "UNCLAIMED" | "CLAIMED";
  tenantSlug: string;
  productId: string;
  apiKeySecret: string;
  publishableKey?: string;
  accountName?: string;
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
  email?: string;
  accountName?: string;
};

function claimableBody(opts: CreateClaimableOptions): Record<string, string> {
  return {
    ref: opts.ref ?? "cli",
    ...(opts.email ? { email: opts.email.trim() } : {}),
    ...(opts.accountName ? { accountName: opts.accountName.trim() } : {}),
  };
}

/** A 404 here is the wrong host, not a missing record — say so. */
async function claimableError(res: Response, url: string): Promise<InfiError> {
  const err = await parseErrorResponse(res);
  if (res.status !== 404) return err;
  return new InfiError(
    `POST ${url} → 404. Claimable tenants exist on the sandbox host only; the live API does not serve this endpoint.`,
    404,
    err.code ?? "claimable_endpoint_not_found",
    {
      command: "infi doctor --json",
      hint: "Drop INFI_API_URL (or point it at https://api-sandbox.beinfi.com) and retry — the CLI picks the host from the key prefix.",
    },
    err.errors,
  );
}

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
  const url = `${baseUrl.replace(/\/$/, "")}/public/v1/claimables`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(claimableBody(opts)),
  });
  if (!res.ok) {
    throw await claimableError(res, url);
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
