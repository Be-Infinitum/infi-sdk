import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("infi.coupons", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("create POSTs /billing/coupons", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "cpn_1", code: "LAUNCH20", percentOff: "20", status: "active" }, 201),
    );
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const coupon = await infi.coupons.create({
      code: "LAUNCH20",
      percentOff: "20",
      duration: "once",
    });

    expect(coupon.code).toBe("LAUNCH20");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/billing/coupons`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
  });

  it("list GETs /billing/coupons and unwraps", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ coupons: [{ id: "cpn_1" }, { id: "cpn_2" }] }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const coupons = await infi.coupons.list();
    expect(coupons).toHaveLength(2);
  });

  it("updateStatus PATCHes /billing/coupons/{id}", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "cpn_1", status: "archived" }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const coupon = await infi.coupons.updateStatus("cpn_1", "archived");

    expect(coupon.status).toBe("archived");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/billing/coupons/cpn_1`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "archived" });
  });
});
