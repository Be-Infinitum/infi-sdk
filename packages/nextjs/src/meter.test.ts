import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeterAbort, withMeter } from "./meter.js";

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
      eventId: expect.any(String),
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

  it("passes the resolved customerId to the handler", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" }))
      .mockResolvedValueOnce(jsonResponse({ accepted: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const handler = vi.fn(async (_req, ctx: { customerId: string }) => ({
      id: ctx.customerId,
      usage: { total_tokens: 1 },
    }));
    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", resolveCustomerId: () => "cus_42" },
      handler,
    );

    await POST(req());
    expect(handler).toHaveBeenCalledWith(expect.any(NextRequest), { customerId: "cus_42" });
  });

  it("returns a handler Response unchanged and records only on 2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" })) // gate
      .mockResolvedValueOnce(jsonResponse({ accepted: 1 })); // track
    vi.stubGlobal("fetch", fetchMock);

    const streamed = new Response("hello", { status: 200, headers: { "content-type": "text/plain" } });
    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", value: 7, resolveCustomerId: () => "cus_1" },
      async () => streamed,
    );

    const res = await POST(req());
    expect(res).toBe(streamed); // not double-wrapped
    expect(await res.text()).toBe("hello");

    // gate + one track (value 7), no double-wrap
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, trackInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(trackInit.body))).toEqual({
      eventId: expect.any(String),
      customerId: "cus_1",
      meter: "tokens",
      value: "7",
    });
  });

  it("does not record when a handler Response is non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" }));
    vi.stubGlobal("fetch", fetchMock);

    const errored = new Response("nope", { status: 500 });
    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", value: 7, resolveCustomerId: () => "cus_1" },
      async () => errored,
    );

    const res = await POST(req());
    expect(res).toBe(errored);
    expect(fetchMock).toHaveBeenCalledTimes(1); // gate only, no track
  });

  it("returns a MeterAbort's body + status and records nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" }));
    vi.stubGlobal("fetch", fetchMock);

    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", resolveCustomerId: () => "cus_1" },
      async () => {
        throw new MeterAbort(422, { error: "prompt_required" });
      },
    );

    const res = await POST(req());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "prompt_required" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // gate only, nothing recorded
  });

  it("threads mode: postpaid records without gating", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ accepted: 1 })); // track only
    vi.stubGlobal("fetch", fetchMock);

    const POST = withMeter(
      { secretKey: "sk_test_x", meter: "tokens", mode: "postpaid", resolveCustomerId: () => "cus_1" },
      async () => ({ usage: { total_tokens: 12 } }),
    );

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no gate, just track
    const [, trackInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(trackInit.body))).toEqual({
      eventId: expect.any(String),
      customerId: "cus_1",
      meter: "tokens",
      value: "12",
    });
  });

  it("threads mode: streaming gates but records nothing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" }));
    vi.stubGlobal("fetch", fetchMock);

    const POST = withMeter(
      {
        secretKey: "sk_test_x",
        meter: "tokens",
        mode: "streaming",
        resolveCustomerId: () => "cus_1",
      },
      async () => ({ usage: { total_tokens: 12 } }),
    );

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1); // gate only, no track
  });
});
