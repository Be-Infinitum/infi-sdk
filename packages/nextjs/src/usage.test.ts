import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Usage } from "./usage.js";

afterEach(() => vi.unstubAllGlobals());

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/usage", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function okFetch() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("Usage", () => {
  it("ingests a single event via /metering/events", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const POST = Usage({ secretKey: "sk_test_x" });
    const res = await POST(jsonRequest({ meter: "tokens", value: "10" }));

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toMatch(/\/metering\/events$/);
    const sent = JSON.parse(String(init.body)) as { meter: string };
    expect(sent.meter).toBe("tokens");
  });

  it("stamps resolveCustomerId onto every event and batches via /metering/events/batch", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const POST = Usage({ secretKey: "sk_test_x", resolveCustomerId: () => "cus_42" });
    await POST(
      jsonRequest({
        events: [
          { meter: "tokens", value: "1" },
          { meter: "tokens", value: "2" },
        ],
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toMatch(/\/metering\/events\/batch$/);
    const sent = JSON.parse(String(init.body)) as { events: { customerId: string }[] };
    expect(sent.events.every((e) => e.customerId === "cus_42")).toBe(true);
  });
});
