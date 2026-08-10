import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const providersList = vi.fn();

vi.mock("../lib/client.js", () => ({
  apiBase: () => "http://localhost:8088",
  resolveSecretKey: () => "sk_test_abc",
  infiClient: () => ({
    products: {
      list: vi.fn().mockResolvedValue([{ id: "p1", key: "demo" }]),
    },
    providers: { list: providersList },
  }),
}));

const { runDoctor } = await import("./doctor.js");

beforeEach(() => {
  providersList.mockReset();
  delete process.env.INFI_SECRET_KEY;
});

afterEach(() => {
  delete process.env.INFI_SECRET_KEY;
});

describe("runDoctor", () => {
  it("passes when a product exists and a provider is connected with its webhook", async () => {
    providersList.mockResolvedValue({
      connections: [{ provider: "stripe", status: "connected", webhookRegistered: true }],
      supported: ["stripe", "asaas"],
    });

    const result = await runDoctor({ local: true, json: false });

    expect(result.ok).toBe(true);
    expect(result.checks.some((c) => c.id === "products" && c.status === "pass")).toBe(true);
    expect(result.checks.some((c) => c.id === "provider" && c.status === "pass")).toBe(true);
  });

  // The failure worth shouting about: a live key with nowhere for the money to
  // land. Sandbox only warns — there is nothing to lose there.
  it("FAILS on a live key with no provider connected, and only warns in sandbox", async () => {
    providersList.mockResolvedValue({ connections: [], supported: ["stripe", "asaas"] });

    const live = await runDoctor({ local: true, json: false, key: "sk_live_real" });
    expect(live.checks.find((c) => c.id === "provider")?.status).toBe("fail");
    expect(live.ok).toBe(false);

    const sandbox = await runDoctor({ local: true, json: false, key: "sk_test_abc" });
    expect(sandbox.checks.find((c) => c.id === "provider")?.status).toBe("warn");
    expect(sandbox.ok).toBe(true);
  });

  it("warns when the provider is connected but its webhook is not registered", async () => {
    providersList.mockResolvedValue({
      connections: [{ provider: "asaas", status: "connected", webhookRegistered: false }],
      supported: ["stripe", "asaas"],
    });

    const result = await runDoctor({ local: true, json: false });

    const check = result.checks.find((c) => c.id === "provider");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("webhook");
  });

  it("warns instead of failing when provider connections cannot be read", async () => {
    providersList.mockRejectedValue(new Error("network down"));

    const result = await runDoctor({ local: true, json: false });

    expect(result.checks.find((c) => c.id === "provider")?.status).toBe("warn");
    expect(result.ok).toBe(true);
  });
});
