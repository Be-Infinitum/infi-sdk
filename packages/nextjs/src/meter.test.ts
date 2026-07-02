import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withMeter } from "./meter.js";

afterEach(() => vi.unstubAllGlobals());

function req(): NextRequest {
  return new NextRequest("https://app.example.com/api/chat", { method: "POST" });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("withMeter", () => {
  it("gates credit, runs the handler, records usage, returns its data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" })) // gate
      .mockResolvedValueOnce(jsonResponse({ accepted: 1 })); // track
    vi.stubGlobal("fetch", fetchMock);

    const handler = vi.fn(async () => ({ answer: "hi", usage: { total_tokens: 30 } }));
    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", resolveCustomerId: () => "cus_1" },
      handler,
    );

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "hi", usage: { total_tokens: 30 } });

    const [, trackInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(trackInit.body))).toEqual({
      customerId: "cus_1",
      meter: "tokens",
      value: "30",
    });
  });

  it("returns 402 and does not run the handler when out of credit", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: "0", total: "5" }));
    vi.stubGlobal("fetch", fetchMock);

    const handler = vi.fn(async () => ({ usage: { total_tokens: 1 } }));
    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", resolveCustomerId: () => "cus_1" },
      handler,
    );

    const res = await POST(req());
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "insufficient_credit" });
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // gate only
  });

  it("returns 400 when the customer cannot be resolved", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", resolveCustomerId: () => undefined },
      async () => ({}),
    );

    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors a custom onInsufficientCredit response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: "0", total: "5" }));
    vi.stubGlobal("fetch", fetchMock);

    const POST = withMeter(
      {
        secretKey: "sk_test_x",
        meter: "tokens",
        resolveCustomerId: () => "cus_1",
        onInsufficientCredit: () => NextResponse.json({ upsell: true }, { status: 200 }),
      },
      async () => ({ usage: { total_tokens: 1 } }),
    );

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ upsell: true });
  });
});
