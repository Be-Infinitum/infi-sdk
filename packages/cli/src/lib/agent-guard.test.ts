import { describe, expect, it } from "vitest";
import { agentWriteRefusal } from "./agent-guard.js";

describe("agentWriteRefusal", () => {
  it("lets a sandbox key provision", () => {
    expect(agentWriteRefusal("infi_bootstrap", "sk_test_abc")).toBeUndefined();
  });

  it("refuses to provision with a live key and points the agent at the proposal path", () => {
    const msg = agentWriteRefusal("infi_bootstrap", "sk_live_abc");
    expect(msg).toMatch(/^infi_bootstrap refused: .*live key/);
    expect(msg).toContain("infi_sync_apply");
    expect(msg).toContain("approves");
  });

  // Fail closed: "not sk_live_" is not the same as "sandbox".
  it("refuses a key it does not recognise", () => {
    expect(agentWriteRefusal("infi_bootstrap", "rk_live_abc")).toMatch(/not a sandbox key/);
    expect(agentWriteRefusal("infi_bootstrap", "sk_xyz")).toBeDefined();
  });

  it("has nothing to say without a key (the tool fails on its own)", () => {
    expect(agentWriteRefusal("infi_bootstrap", undefined)).toBeUndefined();
  });
});
