import { describe, expect, it, vi, afterEach } from "vitest";
import { getGoLiveStatus } from "./go-live.js";

describe("getGoLiveStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INFI_CLAIM_URL;
    delete process.env.INFI_CLAIM_ID;
    delete process.env.INFI_SECRET_KEY;
  });

  it("returns sandbox_unclaimed guidance when claim is UNCLAIMED", async () => {
    process.env.INFI_CLAIM_URL = "https://app.beinfi.com/claim/abc";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "abc",
            status: "UNCLAIMED",
            tenantSlug: "t",
                ref: "cli",
            expiresAt: "2099-01-01T00:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValue(new Response("{}", { status: 404 }));

    vi.stubGlobal("fetch", fetchMock);

    const status = await getGoLiveStatus({
      local: true,
      json: true,
      key: "sk_test_x",
      claimId: "abc",
    });
    expect(status.stage).toBe("sandbox_unclaimed");
    expect(status.urls.connect).toContain("go-live");
    expect(status.next.toLowerCase()).toContain("claim");
  });

  it("reads GET /go-live, not /account/go-live, and reports the request", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).endsWith("/go-live")) {
          return new Response(
            JSON.stringify({ request: { id: "r1", status: "declined", declineReason: "volume", createdAt: "t" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    const status = await getGoLiveStatus({ local: true, json: true, key: "sk_test_x" });
    expect(urls.some((u) => u.endsWith("/go-live") && !u.includes("/account/"))).toBe(true);
    expect(status.stage).toBe("go_live_declined");
    expect(status.next).toContain("volume");
    expect(status.request?.id).toBe("r1");
  });
});
