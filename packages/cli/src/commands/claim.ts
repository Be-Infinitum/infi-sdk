import type { CompanyIntent } from "@beinfi/sdk";
import { apiBase, type GlobalFlags } from "../lib/client.js";
import { createClaimable, getClaimable, type ClaimRef } from "../lib/claim.js";
import { die, ok, printJson } from "../lib/output.js";

export async function claimCreate(
  flags: GlobalFlags & { ref?: ClaimRef; intent?: CompanyIntent; appUrl?: string },
): Promise<void> {
  const claimable = await createClaimable(apiBase(flags), {
    ref: flags.ref ?? "cli",
    intent: flags.intent,
    appUrl: flags.appUrl,
  });
  if (flags.json) {
    printJson(claimable);
    return;
  }
  ok("Claimable tenant provisioned");
  console.log(`  tenant:  ${claimable.tenantSlug}`);
  console.log(`  app:     ${claimable.appSlug}`);
  console.log(`  key:     ${claimable.apiKeySecret}`);
  console.log(`  claim:   ${claimable.claimUrl}`);
  console.log(`  expires: ${claimable.expiresAt}`);
}

export async function claimGet(flags: GlobalFlags & { id?: string }): Promise<void> {
  if (!flags.id) die("Usage: infi claim get <claimable-id>");
  const view = await getClaimable(apiBase(flags), flags.id);
  if (flags.json) {
    printJson(view);
    return;
  }
  console.log(`${view.id}\t${view.status}\t${view.tenantSlug}\t${view.appSlug}`);
}
