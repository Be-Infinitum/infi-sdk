import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "./client.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastCall() {
  const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendEmailCode", () => {
  it("POSTs to the slug-scoped email-code endpoint", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const out = await infi.sendEmailCode({
      slug: "acme",
      email: "a@b.com",
      redirectTo: "http://localhost:3009/callback",
      state: "s1",
    });

    expect(out).toEqual({ status: "sent" });
    const { url, init, body } = lastCall();
    expect(url).toBe(`${BASE}/identity/apps/acme/email-code`);
    expect(init.method).toBe("POST");
    expect(body).toEqual({
      email: "a@b.com",
      redirectTo: "http://localhost:3009/callback",
      state: "s1",
    });
  });

  it("throws on non-202", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "nope" }, 429));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });
    await expect(infi.sendEmailCode({ slug: "acme", email: "a@b.com" })).rejects.toThrow("nope");
  });
});

describe("verifyEmailCode", () => {
  it("POSTs and returns redirectUrl", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ redirectUrl: "http://localhost:3009/callback?code=abc&state=s1" }),
    );
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const out = await infi.verifyEmailCode({ slug: "acme", email: "a@b.com", code: "123456" });

    expect(out.redirectUrl).toContain("code=abc");
    const { url, init, body } = lastCall();
    expect(url).toBe(`${BASE}/identity/apps/acme/verify-code`);
    expect(init.method).toBe("POST");
    expect(body).toEqual({ email: "a@b.com", code: "123456" });
  });
});

describe("exchangeCode", () => {
  it("POSTs with secret-key bearer auth", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ identity: { id: "id_1" } }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const result = await infi.exchangeCode("code_1", { sessionMode: "infi" });

    expect(result.identity?.id).toBe("id_1");
    const { url, init, body } = lastCall();
    expect(url).toBe(`${BASE}/identity/exchange`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
    expect(body).toEqual({ code: "code_1", sessionMode: "infi" });
  });

  it("rejects a publishable key", async () => {
    const infi = new Infi({ secretKey: "pk_live_x", baseUrl: BASE });
    await expect(infi.exchangeCode("code_1")).rejects.toThrow("publishable key");
  });
});

describe("track", () => {
  it("POSTs a single usage event to /metering/events", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accepted: 1 }, 202));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    await infi.track({ meter: "tokens", value: "100", customerId: "cust_1" });

    const { url, init, body } = lastCall();
    expect(url).toBe(`${BASE}/metering/events`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
    expect(body).toEqual({ meter: "tokens", value: "100", customerId: "cust_1" });
  });

  it("POSTs a batch to /metering/events/batch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accepted: 2 }, 202));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    await infi.trackBatch([{ meter: "a" }, { meter: "b" }]);

    const { url, body } = lastCall();
    expect(url).toBe(`${BASE}/metering/events/batch`);
    expect(body).toEqual({ events: [{ meter: "a" }, { meter: "b" }] });
  });
});

describe("getAppConfig", () => {
  it("GETs the public config", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ appName: "Acme", slug: "acme", sessionMode: "infi" }),
    );
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const cfg = await infi.getAppConfig("acme");

    expect(cfg.appName).toBe("Acme");
    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/identity/apps/acme/config`);
    expect(init.method).toBe("GET");
  });
});
