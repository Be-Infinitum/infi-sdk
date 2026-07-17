import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayResource } from "./pay.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PayResource", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("applyCoupon POSTs /pay/{slug}/invoices/{id}/coupon without auth", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "inv_1", status: "open", total: "40.00" }));
    const pay = new PayResource(BASE);

    const invoice = await pay.applyCoupon({ slug: "acme", invoiceId: "inv_1", code: "LAUNCH20" });

    expect(invoice.total).toBe("40.00");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/pay/acme/invoices/inv_1/coupon`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ code: "LAUNCH20" });
  });

  it("downloadUrl builds the public token URL", () => {
    const pay = new PayResource(BASE);
    expect(pay.downloadUrl("acme", "tok_abc")).toBe(`${BASE}/pay/acme/download/tok_abc`);
  });
});
