import { afterEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";
import { buyerHas } from "./buyer-tokens.js";

describe("buyerTokens.verify", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends the bt_ in its own header, never replacing the sk_, and no idempotency key", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ buyer: { customerIds: [], externalIds: [] }, origin: "code", scope: "portal:read", expiresAt: "x", access: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = fetchImpl as unknown as typeof fetch;
    const infi = new Infi({ secretKey: "sk_test_abc", apiUrl: "https://api.test" });
    await infi.buyerTokens.verify("bt_123");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.test/v1/buyer-tokens/verify");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sk_test_abc");
    expect(h["X-Buyer-Token"]).toBe("bt_123");
    expect(h["Idempotency-Key"]).toBeUndefined();
  });

  it("answers has() by manifest key or product id", () => {
    const v = { access: [{ productId: "p1", key: "ecommerce/ebook", name: "Ebook", kind: "purchase" as const }] };
    expect(buyerHas(v, "ecommerce/ebook")).toBe(true);
    expect(buyerHas(v, "p1")).toBe(true);
    expect(buyerHas(v, "ecommerce/curso")).toBe(false);
    expect(buyerHas(null, "p1")).toBe(false);
  });
});
