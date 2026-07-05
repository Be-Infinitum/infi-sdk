import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";
import { exchangeCliToken } from "../resources/auth.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("infi.apiKeys", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("create POSTs /account/api-keys", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "key_1", secret: "sk_test_abc" }, 201));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const key = await infi.apiKeys.create({ kind: "secret" });

    expect(key.secret).toBe("sk_test_abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/account/api-keys`);
    expect(init.method).toBe("POST");
  });

  it("list GETs /account/api-keys", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ apiKeys: [{ id: "k1" }] }));
    const infi = new Infi({ secretKey: "sk_test_x", baseUrl: BASE });

    const keys = await infi.apiKeys.list();
    expect(keys).toHaveLength(1);
  });
});

describe("exchangeCliToken", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs /auth/cli/token with session bearer", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          email: "a@b.com",
          tenant: { id: "t1", slug: "acme", name: "Acme" },
          apiKey: { secret: "sk_test_new" },
        },
        201,
      ),
    );

    const res = await exchangeCliToken({
      baseUrl: BASE,
      sessionToken: "session_jwt",
    });

    expect(res.apiKey.secret).toBe("sk_test_new");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/auth/cli/token`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session_jwt");
  });
});
