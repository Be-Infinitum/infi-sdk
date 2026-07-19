import { afterEach, describe, expect, it, vi } from "vitest";
import { Infi } from "./client.js";
import { bindWallet } from "./wallet.js";

const BASE = "https://api.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("bindWallet", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function client(): Infi {
    vi.stubGlobal("fetch", fetchMock);
    return new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
  }

  it("debit(meter, amount) consumes via credits shim with meter reference", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ balance: "880", total: "1000", entries: [] }),
    );
    const wallet = bindWallet(client(), "enr_1", { defaultMeter: "tokens" });

    const out = await wallet.debit("tokens", "120");

    expect(out).toMatchObject({ meter: "tokens", balance: "880" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/metering/customers/enr_1/credit/consume`);
    expect(JSON.parse(init.body as string)).toEqual({
      amount: "120",
      reference: "meter:tokens",
    });
  });

  it("credit({ meter, amount }) grants with idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ balance: "50000", total: "50000", entries: [] }),
    );
    const wallet = bindWallet(client(), "enr_1");

    await wallet.credit({
      meter: "tokens",
      amount: "50000",
      reason: "cycle",
      idempotencyKey: "pay_1:tokens",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/metering/customers/enr_1/credit`);
    expect(JSON.parse(init.body as string)).toEqual({
      amount: "50000",
      reference: "cycle",
    });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("pay_1:tokens");
  });

  it("balance(meter) reads credits.balance", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ balance: "10", total: "10" }));
    const wallet = bindWallet(client(), "enr_1");

    const out = await wallet.balance("tokens");
    expect(out.meter).toBe("tokens");
    expect(out.balance).toBe("10");
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${BASE}/metering/customers/enr_1/credit`);
  });
});
