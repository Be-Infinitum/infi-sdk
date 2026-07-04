import { Infi } from "@beinfi/sdk";
import type { ClaimableSandboxCreateResponse } from "@beinfi/sdk";
import type { GlobalFlags } from "./client.js";
import { apiBase, publicInfi } from "./client.js";

export async function provisionSandbox(
  flags: GlobalFlags & { ref?: "cli" | "cursor" | "lovable" | "mcp" },
): Promise<ClaimableSandboxCreateResponse> {
  const baseUrl = apiBase(flags);
  const infi = new Infi({ baseUrl });
  return infi.sandbox.create({ ref: flags.ref ?? "cli", baseUrl });
}

export { publicInfi };
