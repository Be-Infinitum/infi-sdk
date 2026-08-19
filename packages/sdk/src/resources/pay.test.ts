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

// Same reason as the checkout case: without this, a second click is a second
// charge, and the docs' advice to derive a stable key is unactionable.
it("charge forwards a caller-supplied idempotency key", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "pay_1", status: "pending" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;

  const pay = new PayResource("http://localhost:8088");
  await pay.charge({ slug: "acme", invoiceId: "inv_1", method: "pix", idempotencyKey: "compra-42" });

  const [, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
  expect(new Headers(init.headers).get("Idempotency-Key")).toBe("compra-42");
});

// Coverage for the shape the README documents: resource methods take the key as a
// trailing argument. Picked revoke because it is a DELETE with no body — the case
// where an options object is easiest to forget.
it("links.revoke forwards a trailing idempotency key", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  global.fetch = fetchMock as unknown as typeof fetch;

  const { Infi } = await import("../client.js");
  const infi = new Infi({ secretKey: "sk_test_x", apiUrl: "http://localhost:8088" });
  await infi.links.revoke("prd_1", "lnk_1", "chave-estavel");

  const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
  expect(new Headers(init.headers).get("Idempotency-Key")).toBe("chave-estavel");
});
