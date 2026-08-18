import { provisioningApiBase, type GlobalFlags } from "../lib/client.js";
import { createClaimable, getClaimable, type ClaimRef } from "../lib/claim.js";
import { fail, ok, printJson } from "../lib/output.js";

export async function claimCreate(flags: GlobalFlags & { ref?: ClaimRef }): Promise<void> {
  const claimable = await createClaimable(provisioningApiBase(flags), {
    ref: flags.ref ?? "cli",
  });
  if (flags.json) {
    printJson(claimable);
    return;
  }
  ok("Claimable tenant provisioned");
  console.log(`  tenant:  ${claimable.tenantSlug}`);
  console.log(`  key:     ${claimable.apiKeySecret}`);
  console.log(`  claim:   ${claimable.claimUrl}`);
  console.log(`  expires: ${claimable.expiresAt}`);
}

export async function claimGet(flags: GlobalFlags & { id?: string }): Promise<void> {
  if (!flags.id) fail(new Error("Usage: infi claim get <claimable-id>"), flags.json);
  const view = await getClaimable(provisioningApiBase(flags), flags.id);
  if (flags.json) {
    printJson(view);
    return;
  }
  console.log(`${view.id}\t${view.status}\t${view.tenantSlug}`);
}
