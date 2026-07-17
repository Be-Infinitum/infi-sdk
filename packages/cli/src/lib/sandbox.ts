import { parseErrorResponse } from "@beinfi/sdk";

export type SandboxRef = "lovable" | "mcp" | "cursor" | "cli";

export type ClaimableSandboxCreateResponse = {
  id: string;
  status: "UNCLAIMED" | "CLAIMED";
  tenantSlug: string;
  productId: string;
  appSlug: string;
  apiKeySecret: string;
  claimUrl: string;
  expiresAt: string;
};

export type ClaimableSandboxPublicView = {
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
 * Public sandbox provisioning — no secret key required. Lives in the CLI
 * because provisioning is a dev-time/onboarding concern, not an app runtime
 * call. See ADR 0001.
 */
export async function createSandbox(
  baseUrl: string,
  ref: SandboxRef = "cli",
): Promise<ClaimableSandboxCreateResponse> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/public/v1/sandbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ref }),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return (await res.json()) as ClaimableSandboxCreateResponse;
}

/** Public sandbox status (no secrets). */
export async function getSandbox(
  baseUrl: string,
  sandboxId: string,
): Promise<ClaimableSandboxPublicView> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/public/v1/sandbox/${encodeURIComponent(sandboxId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return (await res.json()) as ClaimableSandboxPublicView;
}
