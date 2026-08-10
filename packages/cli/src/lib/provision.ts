import type { GlobalFlags } from "./client.js";
import { apiBase, publicInfi } from "./client.js";
import { createClaimable } from "./claim.js";
import type { ClaimableTenantCreateResponse, ClaimRef } from "./claim.js";

export type {
  ClaimableTenantCreateResponse,
  ClaimableTenantPublicView,
  ClaimRef,
} from "./claim.js";

export async function provisionClaimable(
  flags: GlobalFlags & { ref?: ClaimRef; intent?: import("@beinfi/sdk").CompanyIntent },
): Promise<ClaimableTenantCreateResponse> {
  return createClaimable(apiBase(flags), {
    ref: flags.ref ?? "cli",
    intent: flags.intent,
  });
}

export { publicInfi };
