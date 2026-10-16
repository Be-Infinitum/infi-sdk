import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const morGet = vi.fn();
const base = vi.fn<() => string>();
const override = vi.fn<() => { url: string; source: string } | undefined>();

vi.mock("../lib/client.js", () => ({
  apiBase: () => base(),
  apiBaseOverride: () => override(),
  appBase: () => "https://app-sandbox.beinfi.com",
  // Honor --key: doctor derives the mode from the key it actually resolved.
  resolveSecretKey: (flags: { key?: string }) => flags?.key ?? "sk_test_abc",
  infiClient: () => ({
    products: {
      list: vi.fn().mockResolvedValue([{ id: "p1", key: "demo" }]),
    },
    account: { mor: morGet },
  }),
}));

const { runDoctor } = await import("./doctor.js");

beforeEach(() => {
  morGet.mockReset();
  base.mockReturnValue("http://localhost:8088");
  override.mockReturnValue({ url: "http://localhost:8088", source: "--local" });
  delete process.env.INFI_SECRET_KEY;
});

afterEach(() => {
  delete process.env.INFI_SECRET_KEY;
});

describe("runDoctor", () => {
  const admission = (status: string, decisionReason: string | null = null) => ({
    seller: null,
    agreement: null,
    admission: { status, decisionReason, application: null, agreementRevisionId: null, agreementAcceptedAt: null, submittedAt: null, decidedAt: null },
  });

  it("passes when a product exists and the merchant-of-record admission is approved", async () => {
    morGet.mockResolvedValue(admission("approved"));

    const result = await runDoctor({ local: true, json: false });

    expect(result.ok).toBe(true);
    expect(result.checks.some((c) => c.id === "products" && c.status === "pass")).toBe(true);
    expect(result.checks.some((c) => c.id === "mor_admission" && c.status === "pass")).toBe(true);
    expect(result.checks.some((c) => c.id === "provider")).toBe(false);
  });

  // A live key with no admission cannot sell. Sandbox only warns.
  it("FAILS on a live key without admission, warns in sandbox, and points at /go-live", async () => {
    morGet.mockResolvedValue(admission("draft"));

    const live = await runDoctor({ local: true, json: false, key: "sk_live_real" });
    const check = live.checks.find((c) => c.id === "mor_admission");
    expect(check?.status).toBe("fail");
    expect(check?.fix?.docs).toBe("https://app-sandbox.beinfi.com/go-live");
    expect(live.ok).toBe(false);

    const sandbox = await runDoctor({ local: true, json: false, key: "sk_test_abc" });
    expect(sandbox.checks.find((c) => c.id === "mor_admission")?.status).toBe("warn");
    expect(sandbox.ok).toBe(true);
  });

  it("only warns while the application is under review, and names a rejection's reason", async () => {
    morGet.mockResolvedValue(admission("submitted"));
    const pending = await runDoctor({ local: true, json: false, key: "sk_live_real" });
    expect(pending.checks.find((c) => c.id === "mor_admission")?.status).toBe("warn");

    morGet.mockResolvedValue(admission("rejected", "missing company number"));
    const rejected = await runDoctor({ local: true, json: false, key: "sk_test_abc" });
    expect(rejected.checks.find((c) => c.id === "mor_admission")?.message).toContain("missing company number");
  });

  // Doctor printed "Secret key present (sandbox)" and "API base:
  // https://api.beinfi.com" as two passes side by side. Reporting a host that
  // cannot serve the key as a pass is the whole defect.
  it("FAILS when the API host cannot serve the key's mode", async () => {
    morGet.mockResolvedValue(admission("approved"));
    base.mockReturnValue("https://api.beinfi.com");
    override.mockReturnValue(undefined);

    const result = await runDoctor({ json: false, key: "sk_test_abc" });

    const check = result.checks.find((c) => c.id === "api_base");
    expect(check?.status).toBe("fail");
    expect(check?.message).toContain("https://api-sandbox.beinfi.com");
    expect(result.ok).toBe(false);
  });

  it("passes and names the mode when the host matches the key", async () => {
    morGet.mockResolvedValue(admission("approved"));
    base.mockReturnValue("https://api-sandbox.beinfi.com");
    override.mockReturnValue(undefined);

    const result = await runDoctor({ json: false, key: "sk_test_abc" });

    const check = result.checks.find((c) => c.id === "api_base");
    expect(check?.status).toBe("pass");
    expect(check?.message).toContain("sandbox");
  });

  it("only warns when the host was pinned by hand", async () => {
    morGet.mockResolvedValue(admission("approved"));

    const result = await runDoctor({ local: true, json: false, key: "sk_test_abc" });

    const check = result.checks.find((c) => c.id === "api_base");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("--local");
  });

  it("explains a sandbox 404 instead of leaking it", async () => {
    morGet.mockRejectedValue(Object.assign(new Error("Request failed"), { status: 404 }));

    const result = await runDoctor({ local: true, json: false, key: "sk_test_abc" });

    const check = result.checks.find((c) => c.id === "mor_admission");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("sandbox charges need none");
  });

  it("warns instead of failing when the admission cannot be read", async () => {
    morGet.mockRejectedValue(new Error("network down"));

    const result = await runDoctor({ local: true, json: false });

    expect(result.checks.find((c) => c.id === "mor_admission")?.status).toBe("warn");
    expect(result.ok).toBe(true);
  });
});
