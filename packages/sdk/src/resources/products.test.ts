import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("infi.products.deliverable.presign", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  // Both fields are optional in the generated contract, so the documented
  // presign -> PUT -> save flow did not compile: fetch() rejects
  // `string | undefined`. presign narrows them for the caller.
  it("returns uploadUrl and objectKey as plain strings", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        uploadUrl: "https://r2.example/signed",
        objectKey: "tenants/t/deliverables/p/abc-guia.pdf",
        expiresAt: "2026-08-19T18:00:00Z",
      }),
    );
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    const up = await infi.products.deliverable.presign("prd_1", {
      fileName: "guia.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    });

    // Assigning to `string` is the point of the test: it must not be optional.
    const url: string = up.uploadUrl;
    const key: string = up.objectKey;
    expect(url).toBe("https://r2.example/signed");
    expect(key).toBe("tenants/t/deliverables/p/abc-guia.pdf");
    const [reqUrl] = fetchMock.mock.calls[0] as [string];
    expect(String(reqUrl)).toBe(`${BASE}/metering/products/prd_1/deliverable/presign`);
  });

  it("throws invalid_response when the API omits them", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ expiresAt: "2026-08-19T18:00:00Z" }));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });

    await expect(
      infi.products.deliverable.presign("prd_1", { fileName: "g.pdf" }),
    ).rejects.toMatchObject({ status: 502, code: "invalid_response" });
  });
});
