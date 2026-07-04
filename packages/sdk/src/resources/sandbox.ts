import type { Transport } from "../http.js";

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

export type CreateSandboxOptions = {
  /** Attribution ref for the provisioning source. */
  ref?: SandboxRef;
  /** Override API base (defaults to transport baseUrl). */
  baseUrl?: string;
};

/**
 * Public sandbox provisioning — no secret key required.
 * Used by create-infi-app and integrations to spin up a claimable tenant.
 */
export class SandboxResource {
  constructor(
    private readonly t: Transport,
    private readonly baseUrl: string,
  ) {}

  /** Provision a claimable billing sandbox (returns sk_test_ + claim URL). */
  async create(options: CreateSandboxOptions = {}): Promise<ClaimableSandboxCreateResponse> {
    const base = (options.baseUrl ?? this.baseUrl).replace(/\/$/, "");
    const res = await fetch(`${base}/public/v1/sandbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ref: options.ref ?? "cli" }),
    });
    if (!res.ok) {
      const { parseErrorResponse } = await import("../errors.js");
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as ClaimableSandboxCreateResponse;
  }

  /** Public sandbox status (no secrets). */
  async get(sandboxId: string, options: { baseUrl?: string } = {}): Promise<ClaimableSandboxPublicView> {
    const base = (options.baseUrl ?? this.baseUrl).replace(/\/$/, "");
    const res = await fetch(`${base}/public/v1/sandbox/${encodeURIComponent(sandboxId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const { parseErrorResponse } = await import("../errors.js");
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as ClaimableSandboxPublicView;
  }
}
