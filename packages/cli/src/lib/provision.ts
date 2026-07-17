import type { GlobalFlags } from "./client.js";
import { apiBase, publicInfi } from "./client.js";
import { createSandbox } from "./sandbox.js";
import type { ClaimableSandboxCreateResponse, SandboxRef } from "./sandbox.js";

export type { ClaimableSandboxCreateResponse, ClaimableSandboxPublicView, SandboxRef } from "./sandbox.js";

export async function provisionSandbox(
  flags: GlobalFlags & { ref?: SandboxRef },
): Promise<ClaimableSandboxCreateResponse> {
  return createSandbox(apiBase(flags), flags.ref ?? "cli");
}

export { publicInfi };
