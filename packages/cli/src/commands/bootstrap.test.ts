import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/claim.js", () => ({ createClaimable: vi.fn(), getClaimable: vi.fn() }));
vi.mock("./doctor.js", () => ({ runDoctor: vi.fn(async () => ({ ok: true, checks: [] })) }));
import { createClaimable, getClaimable } from "../lib/claim.js";
import { runBootstrap, runAgentOnboarding } from "./bootstrap.js";

let cwd: string;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "infi-onboard-"));
  vi.mocked(createClaimable).mockResolvedValue({ id: "claim_1", status: "UNCLAIMED", tenantSlug: "app-123", accountName: "Acme", productId: "prod_1", apiKeySecret: "sk_test_example", publishableKey: "pk_test_example", claimUrl: "https://app-sandbox.beinfi.com/claim/claim_1", expiresAt: "2099-01-01T00:00:00Z" });
  vi.mocked(getClaimable).mockResolvedValue({ id: "claim_1", status: "UNCLAIMED", tenantSlug: "app-123", ref: "mcp", expiresAt: "2099-01-01T00:00:00Z" });
});
afterEach(() => { fs.rmSync(cwd, { recursive: true, force: true }); vi.clearAllMocks(); });

describe("agent onboarding", () => {
  it("recognizes an existing app before asking signup questions", async () => {
    fs.writeFileSync(path.join(cwd, ".env.local"), "INFI_SECRET_KEY=sk_test_existing\n");
    expect(await runAgentOnboarding({ cwd })).toMatchObject({ status: "existing_integration" });
    expect(createClaimable).not.toHaveBeenCalled();
  });
  it("asks for missing fields without provisioning or writing files", async () => {
    const result = await runAgentOnboarding({ cwd });
    expect(result.status).toBe("requires_input");
    expect(result).toMatchObject({ missingFields: ["email", "accountName", "intent"] });
    expect(createClaimable).not.toHaveBeenCalled();
    expect(fs.readdirSync(cwd)).toEqual([]);
  });
  it("forwards the supplied identity hints and preserves other app secrets", async () => {
    fs.writeFileSync(path.join(cwd, ".env.local"), "DATABASE_URL=postgres://example\n");
    const result = await runAgentOnboarding({ cwd, email: "founder@example.com", accountName: "Acme", intent: "one-time", skipSync: true });
    expect(result.status).toBe("ready");
    expect(createClaimable).toHaveBeenCalledWith(expect.any(String), { ref: "cli", email: "founder@example.com", accountName: "Acme" });
    expect(fs.readFileSync(path.join(cwd, ".env.local"), "utf8")).toContain("DATABASE_URL=postgres://example");
    expect(fs.readFileSync(path.join(cwd, ".env.local"), "utf8")).toContain("INFI_PUBLISHABLE_KEY=pk_test_example");
    expect(result).toMatchObject({ registration: { status: "pending_claim", claimUrl: expect.any(String) } });
  });
  it("resumes the same account after an interrupted integration", async () => {
    await runBootstrap({ cwd, intent: "one-time", skipSync: true });
    const file = path.join(cwd, "infi.company.ts");
    fs.appendFileSync(file, "\n// customer's changes\n");
    await runAgentOnboarding({ cwd, skipSync: true });
    expect(createClaimable).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(file, "utf8")).toContain("customer's changes");
  });
  it("refuses to replace an unrelated existing integration", async () => {
    fs.writeFileSync(path.join(cwd, ".env.local"), "INFI_SECRET_KEY=sk_live_existing\n");
    await expect(runBootstrap({ cwd, skipSync: true })).rejects.toThrow(/already configured/i);
    expect(createClaimable).not.toHaveBeenCalled();
  });
  it("does not repeat provisioning after an uncertain network failure", async () => {
    vi.mocked(createClaimable).mockRejectedValueOnce(new Error("connection lost"));
    await expect(runBootstrap({ cwd, skipSync: true })).rejects.toThrow("connection lost");
    await expect(runBootstrap({ cwd, skipSync: true })).rejects.toThrow(/uncertain/i);
    expect(createClaimable).toHaveBeenCalledTimes(1);
  });
});
