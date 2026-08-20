import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("infi.payments", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  const infi = () => new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

  it("refund posts an empty body for a full refund", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "p1", status: "refunded", refundedAmount: "100.00" }));

    const p = await infi().payments.refund("p1", {}, "idem-1");

    expect(p.refundedAmount).toBe("100.00");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/billing/payments/p1/refund`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-1");
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  // revokeAccess must survive as an explicit false. Dropping it (a truthiness
  // filter on the body) would silently flip the merchant's "refund but let them
  // keep the file" into revoking the download.
  it("sends revokeAccess:false rather than omitting it", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "p1", status: "refunded" }));

    await infi().payments.refund("p1", { amount: "100.00", revokeAccess: false });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ amount: "100.00", revokeAccess: false });
  });

  it("refunds() reads the individual records", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ refunds: [{ id: "r1", amount: "5.00", reason: "goodwill", createdAt: "2026-08-20T00:00:00Z" }] }),
    );

    const refunds = await infi().payments.refunds("p1");

    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.reason).toBe("goodwill");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${BASE}/billing/payments/p1/refunds`);
  });

  it("list tolerates a response with no payments array", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await infi().payments.list()).toEqual([]);
  });

  it("list passes only the filters that were set", async () => {
    fetchMock.mockResolvedValueOnce(json({ payments: [] }));

    await infi().payments.list({ status: "refunded", provider: undefined });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${BASE}/billing/payments?status=refunded`);
  });
});
