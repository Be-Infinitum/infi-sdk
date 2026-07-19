import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaimable, getClaimable } from "./claim.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("cli claim", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("createClaimable POSTs /public/v1/claimables without auth", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: "sb_1",
          status: "UNCLAIMED",
          tenantSlug: "acme",
          productId: "prod_1",
          appSlug: "acme-app",
          apiKeySecret: "sk_test_abc",
          claimUrl: "https://new.beinfi.com/claim/sb_1",
          expiresAt: "2026-08-01T00:00:00Z",
        },
        201,
      ),
    );

    const claimable = await createClaimable(BASE, "cli");

    expect(claimable.apiKeySecret).toBe("sk_test_abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/public/v1/claimables`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ ref: "cli" });
  });

  it("getClaimable fetches public claimable status", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "sb_1",
        status: "UNCLAIMED",
        tenantSlug: "acme",
        appSlug: "acme-app",
        ref: "cli",
        expiresAt: "2026-08-01T00:00:00Z",
      }),
    );

    const view = await getClaimable(BASE, "sb_1");

    expect(view.status).toBe("UNCLAIMED");
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${BASE}/public/v1/claimables/sb_1`);
  });
});
