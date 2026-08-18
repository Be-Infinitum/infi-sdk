import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real loader reads ~/.config/infi/config.json, which would make these tests
// depend on whoever runs them.
const profile = vi.fn<() => { secretKey?: string; baseUrl?: string } | undefined>();
vi.mock("./config.js", () => ({
  loadConfig: () => ({ defaultProfile: "default", profiles: {} }),
  getProfile: () => profile(),
}));

const { apiBase, appBase, provisioningApiBase, resolveMode, resolveSecretKey } = await import(
  "./client.js"
);

const SANDBOX = "https://api-sandbox.beinfi.com";
const LIVE = "https://api.beinfi.com";

beforeEach(() => {
  profile.mockReturnValue(undefined);
  delete process.env.INFI_SECRET_KEY;
  delete process.env.INFI_API_URL;
  delete process.env.INFI_APP_URL;
});
afterEach(() => {
  delete process.env.INFI_SECRET_KEY;
  delete process.env.INFI_API_URL;
  delete process.env.INFI_APP_URL;
});

describe("apiBase", () => {
  // The bug: it defaulted to the live host, so a sk_test_ key 401'd on every call
  // and the sandbox-only /public/v1/claimables 404'd.
  it("sends a sandbox key to the sandbox host", () => {
    expect(apiBase({ key: "sk_test_abc" })).toBe(SANDBOX);
    expect(resolveMode({ key: "sk_test_abc" })).toBe("sandbox");
  });

  it("sends a live key to the live host", () => {
    expect(apiBase({ key: "sk_live_abc" })).toBe(LIVE);
    expect(resolveMode({ key: "sk_live_abc" })).toBe("live");
  });

  it("reads the key from the environment and from the saved profile", () => {
    process.env.INFI_SECRET_KEY = "sk_live_env";
    expect(apiBase({})).toBe(LIVE);

    delete process.env.INFI_SECRET_KEY;
    profile.mockReturnValue({ secretKey: "sk_test_saved" });
    expect(apiBase({})).toBe(SANDBOX);
  });

  it("defaults to sandbox with no key at all — live serves no provisioning", () => {
    expect(apiBase({})).toBe(SANDBOX);
  });

  it("honors --local and INFI_API_URL, and lets --key outrank a saved host", () => {
    expect(apiBase({ local: true, key: "sk_live_abc" })).toBe("http://localhost:8088");

    process.env.INFI_API_URL = "https://api.example.test/";
    expect(apiBase({ key: "sk_test_abc" })).toBe("https://api.example.test");
    delete process.env.INFI_API_URL;

    profile.mockReturnValue({ secretKey: "sk_live_saved", baseUrl: "https://self.hosted" });
    expect(apiBase({})).toBe("https://self.hosted");
    expect(apiBase({ key: "sk_test_abc" })).toBe(SANDBOX);
  });
});

describe("appBase", () => {
  it("is mode-aware too — a sandbox tenant does not exist on the live dashboard", () => {
    expect(appBase({ key: "sk_test_abc" })).toBe("https://app-sandbox.beinfi.com");
    expect(appBase({ key: "sk_live_abc" })).toBe("https://app.beinfi.com");
  });

  it("never builds a URL on new.beinfi.com, which does not resolve", () => {
    expect(appBase({})).not.toContain("new.beinfi.com");
  });
});

describe("provisioningApiBase", () => {
  it("stays on sandbox even for a live key, since live has no claimables", () => {
    expect(provisioningApiBase({ key: "sk_live_abc" })).toBe(SANDBOX);
    profile.mockReturnValue({ secretKey: "sk_live_saved", baseUrl: "https://api.beinfi.com" });
    expect(provisioningApiBase({})).toBe(SANDBOX);
  });

  it("still honors an explicit override", () => {
    expect(provisioningApiBase({ local: true })).toBe("http://localhost:8088");
  });
});

describe("resolveSecretKey", () => {
  it("throws a coded error so --json output carries a fix", () => {
    try {
      resolveSecretKey({});
      throw new Error("expected a throw");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("missing_secret_key");
      expect((err as { fix?: { command?: string } }).fix?.command).toBeTruthy();
    }
  });
});
