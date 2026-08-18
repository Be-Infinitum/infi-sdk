import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "./client.js";
import { InfiError } from "./errors.js";

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

describe("track", () => {
  it("POSTs a single usage event to /metering/events", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accepted: 1 }, 202));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    await infi.track({ meter: "tokens", value: "100", customerId: "cust_1" });

    const { url, init, body } = lastCall();
    expect(url).toBe(`${BASE}/metering/events`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
    expect(body).toEqual({ eventId: expect.any(String), meter: "tokens", value: "100", customerId: "cust_1" });
  });

  it("POSTs a batch to /metering/events/batch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accepted: 2 }, 202));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    await infi.trackBatch([{ meter: "a" }, { meter: "b" }]);

    const { url, body } = lastCall();
    expect(url).toBe(`${BASE}/metering/events/batch`);
    expect(body).toEqual({
      events: [
        { eventId: expect.any(String), meter: "a" },
        { eventId: expect.any(String), meter: "b" },
      ],
    });
  });
});

describe("host resolution", () => {
  // A sandbox tenant does not exist on the live app: a link built there 404s.
  it("uses the sandbox app host for a test key", () => {
    const infi = new Infi("sk_test_x");
    expect(infi.mode).toBe("sandbox");
    expect(infi.apiBase).toBe("https://api-sandbox.beinfi.com");
    expect(infi.appBase).toBe("https://app-sandbox.beinfi.com");
  });

  it("uses the live app host for a live key", () => {
    const infi = new Infi("sk_live_x");
    expect(infi.apiBase).toBe("https://api.beinfi.com");
    expect(infi.appBase).toBe("https://app.beinfi.com");
  });

  it("lets an explicit appUrl win, trailing slash trimmed", () => {
    const infi = new Infi({ secretKey: "sk_test_x", appUrl: "http://localhost:3000/" });
    expect(infi.appBase).toBe("http://localhost:3000");
  });

  it("puts payment links on the app host of the resolved mode", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "lnk_1", token: "plink_abc" }, 201));

    const link = await new Infi("sk_test_x").links.create("prd_1", { slug: "acme" });

    expect(link.url).toBe("https://app-sandbox.beinfi.com/pay/acme/links/plink_abc");
  });
});

describe("checkout", () => {
  it("builds the hosted URL on the mode's app host", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "inv_1", status: "open" }, 201));

    const { url } = await new Infi({ secretKey: "sk_test_x", apiUrl: BASE }).checkout({
      slug: "acme",
      payerId: "cus_1",
      lineItems: [{ description: "Ebook", amount: "49.90" }],
    });

    expect(url).toBe("https://app-sandbox.beinfi.com/pay/acme/invoices/inv_1");
  });

  it("throws on a missing slug instead of interpolating `undefined`", async () => {
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    // What an untyped JS caller does; the type requires slug.
    const call = infi.checkout({ payerId: "cus_1", lineItems: [] } as never);

    await expect(call).rejects.toThrowError(InfiError);
    await expect(call).rejects.toMatchObject({ status: 400, code: "missing_slug" });
    // Nothing was charged/created on the way out.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on an empty slug for links.create too, before creating the link", async () => {
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    await expect(infi.links.create("prd_1", { slug: "" })).rejects.toMatchObject({
      code: "missing_slug",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

