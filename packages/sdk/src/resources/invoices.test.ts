import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("infi.invoices.fromUsage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs /billing/invoices/from-usage with the window", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "inv_1", status: "open", total: "12.34" }, 201));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const inv = await infi.invoices.fromUsage({ customerId: "enr_1", from: "2026-07-01T00:00:00Z", to: "2026-07-17T00:00:00Z", send: true });

    expect(inv.id).toBe("inv_1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/billing/invoices/from-usage`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      customerId: "enr_1",
      from: "2026-07-01T00:00:00Z",
      to: "2026-07-17T00:00:00Z",
      send: true,
    });
  });
});

describe("infi.session", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("batches queued events into one trackBatch, then clears", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accepted: 2, failed: 0 }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const s = infi.session("enr_1");
    s.track("tokens", 1500, { model: "gpt-4o-mini" }).track("requests", 1);
    expect(s.size).toBe(2);

    const res = await s.flush();
    expect(res).toEqual({ accepted: 2, failed: 0 });
    expect(s.size).toBe(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/metering/events/batch`);
    expect(JSON.parse(init.body as string)).toEqual({
      events: [
        { customerId: "enr_1", meter: "tokens", value: "1500", metadata: { model: "gpt-4o-mini" } },
        { customerId: "enr_1", meter: "requests", value: "1" },
      ],
    });
  });

  it("flush is a no-op when empty", async () => {
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });
    const res = await infi.session("enr_1").flush();
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
