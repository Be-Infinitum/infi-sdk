import { describe, expect, it } from "vitest";
import { agentWriteRefusal } from "./agent-guard.js";

describe("agentWriteRefusal", () => {
  it("lets a sandbox key write", () => {
    expect(agentWriteRefusal("infi_sync_apply", "sk_test_abc")).toBeUndefined();
  });

  it("refuses a live key and points the agent at the human path", () => {
    const msg = agentWriteRefusal("infi_sync_apply", "sk_live_abc");
    expect(msg).toMatch(/^infi_sync_apply refused: .*live key/);
    expect(msg).toContain("infi_sync_plan");
    expect(msg).toContain("`infi sync`");
  });

  // Fail closed: "not sk_live_" is not the same as "sandbox".
  it("refuses a key it does not recognise", () => {
    expect(agentWriteRefusal("infi_sync_apply", "rk_live_abc")).toMatch(/not a sandbox key/);
    expect(agentWriteRefusal("infi_sync_apply", "sk_xyz")).toBeDefined();
  });

  it("has nothing to say without a key (the tool fails on its own)", () => {
    expect(agentWriteRefusal("infi_sync_apply", undefined)).toBeUndefined();
  });
});
