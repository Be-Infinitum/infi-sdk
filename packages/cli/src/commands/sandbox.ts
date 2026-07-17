import { apiBase, type GlobalFlags } from "../lib/client.js";
import { provisionSandbox } from "../lib/provision.js";
import { getSandbox, type SandboxRef } from "../lib/sandbox.js";
import { die, ok, printJson } from "../lib/output.js";

export async function sandboxCreate(
  flags: GlobalFlags & { ref?: SandboxRef },
): Promise<void> {
  const sandbox = await provisionSandbox(flags);
  if (flags.json) {
    printJson(sandbox);
    return;
  }
  ok("Sandbox provisioned");
  console.log(`  tenant:  ${sandbox.tenantSlug}`);
  console.log(`  app:     ${sandbox.appSlug}`);
  console.log(`  key:     ${sandbox.apiKeySecret}`);
  console.log(`  claim:   ${sandbox.claimUrl}`);
  console.log(`  expires: ${sandbox.expiresAt}`);
}

export async function sandboxGet(flags: GlobalFlags & { id?: string }): Promise<void> {
  if (!flags.id) die("Usage: infi sandbox get <sandbox-id>");
  const view = await getSandbox(apiBase(flags), flags.id);
  if (flags.json) {
    printJson(view);
    return;
  }
  console.log(`${view.id}\t${view.status}\t${view.tenantSlug}\t${view.appSlug}`);
}
