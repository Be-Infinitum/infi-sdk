import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "./client.js";
import { InsufficientCreditError } from "./errors.js";
import { extractTokens, resolveUsageValue } from "./meter.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("extractTokens", () => {
  it("reads OpenAI usage.total_tokens", () => {
    expect(extractTokens({ usage: { total_tokens: 42 } })).toBe(42);
  });

  it("sums Anthropic input + output tokens", () => {
    expect(extractTokens({ usage: { input_tokens: 10, output_tokens: 7 } })).toBe(17);
  });

  it("returns undefined for unrecognized shapes", () => {
    expect(extractTokens({ foo: 1 })).toBeUndefined();
    expect(extractTokens(null)).toBeUndefined();
    expect(extractTokens("nope")).toBeUndefined();
  });
});

describe("resolveUsageValue", () => {
  const base = { customerId: "c1", meter: "tokens" };

  it("prefers an explicit value", () => {
    expect(resolveUsageValue({ ...base, value: 5 }, { usage: { total_tokens: 99 } })).toBe("5");
  });

  it("uses a custom extractor over built-in detection", () => {
    expect(resolveUsageValue({ ...base, extract: () => 3 }, {})).toBe("3");
  });

  it("falls back to token detection", () => {
    expect(resolveUsageValue(base, { usage: { total_tokens: 12 } })).toBe("12");
  });

  it("throws when usage cannot be determined", () => {
    expect(() => resolveUsageValue(base, {})).toThrow(/could not determine usage/);
  });
});

describe("infi.meter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("guards, runs fn, and records auto-detected usage", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" })) // credit gate
      .mockResolvedValueOnce(jsonResponse({ accepted: 1 })); // track
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const llmResult = { choices: ["hi"], usage: { total_tokens: 42 } };
    const out = await infi.meter({ customerId: "c1", meter: "tokens" }, async () => llmResult);

    expect(out).toBe(llmResult); // result returned unchanged
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [gateUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(gateUrl)).toBe(`${BASE}/metering/customers/c1/credit`);

    const [trackUrl, trackInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(String(trackUrl)).toBe(`${BASE}/metering/events`);
    expect(JSON.parse(trackInit.body as string)).toEqual({
      customerId: "c1",
      meter: "tokens",
      value: "42",
    });
  });

  it("throws InsufficientCreditError before running fn when balance is 0", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ balance: "0", total: "10" }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const fn = vi.fn(async () => ({ usage: { total_tokens: 1 } }));
    await expect(infi.meter({ customerId: "c1", meter: "tokens" }, fn)).rejects.toBeInstanceOf(
      InsufficientCreditError,
    );
    expect(fn).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no track
  });

  it("skipGuard records without a credit check", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accepted: 1 })); // track only
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    await infi.meter({ customerId: "c1", meter: "req", value: 1, skipGuard: true }, async () => ({}));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/metering/events`);
  });

  it("does not record when fn throws", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ balance: "100", total: "100" }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    await expect(
      infi.meter({ customerId: "c1", meter: "tokens" }, async () => {
        throw new Error("llm down");
      }),
    ).rejects.toThrow("llm down");
    expect(fetchMock).toHaveBeenCalledTimes(1); // gate only, no track
  });
});
