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

