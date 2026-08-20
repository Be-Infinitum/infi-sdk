import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";

describe("infi.account", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  // A cold-start test shipped a store whose checkout said "New app", found nothing
  // in the docs or the SDK to change it, and guessed this route from the HTTP
  // reference. Nobody launches a shop called "New app".
  it("update PATCHes the tenant with an idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ slug: "acme", name: "Cafeteria Orvalho" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    const tenant = await infi.account.update({ name: "Cafeteria Orvalho" }, "idem-1");

    expect(tenant.name).toBe("Cafeteria Orvalho");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/account/tenant`);
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-1");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Cafeteria Orvalho" });
  });

  it("get reads it back", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ slug: "acme", name: "Acme" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    expect((await infi.account.get()).slug).toBe("acme");
  });
});
