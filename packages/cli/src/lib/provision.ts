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
  flags: GlobalFlags & { ref?: ClaimRef },
): Promise<ClaimableTenantCreateResponse> {
  return createClaimable(apiBase(flags), flags.ref ?? "cli");
}

export { publicInfi };
