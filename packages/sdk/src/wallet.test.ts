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

  it("debit(meter, amount) draws from that meter's wallet", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ meter: "tokens", balance: "880", total: "1000" }, 201));
    const wallet = bindWallet(client(), "enr_1", { defaultMeter: "tokens" });

    const out = await wallet.debit("tokens", "120");

    expect(out).toMatchObject({ meter: "tokens", balance: "880" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/customers/enr_1/wallet/debit`);
    expect(JSON.parse(init.body as string)).toEqual({ meter: "tokens", amount: "120" });
  });

  it("credit({ meter, amount }) grants with idempotency on the header and the wallet", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ meter: "tokens", balance: "50000", total: "50000" }, 201));
    const wallet = bindWallet(client(), "enr_1");

    await wallet.credit({
      meter: "tokens",
      amount: "50000",
      reason: "cycle",
      idempotencyKey: "pay_1:tokens",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/customers/enr_1/wallet/credit`);
    expect(JSON.parse(init.body as string)).toEqual({
      meter: "tokens",
      amount: "50000",
      reason: "cycle",
      // The wallet refuses ':' in its own key.
      idempotencyKey: "pay_1_tokens",
    });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("pay_1:tokens");
  });

  it("balance(meter) reads that meter's wallet", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ meter: "tokens", balance: "10", total: "10" }));
    const wallet = bindWallet(client(), "enr_1");

    const out = await wallet.balance("tokens");
    expect(out.meter).toBe("tokens");
    expect(out.balance).toBe("10");
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${BASE}/customers/enr_1/wallet?meter=tokens`);
  });
});
