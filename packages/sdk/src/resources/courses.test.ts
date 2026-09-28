import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("courses, access and customer login", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  const call = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return { url: String(url), init, body: init.body ? JSON.parse(String(init.body)) : undefined };
  };

  it("creates a lesson with the provider's link, on the course", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "l1", video: { url: "https://vimeo.com/1", provider: "vimeo" } }, 201));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
    const lesson = await infi.courses.createLesson("c1", { moduleId: "m1", title: "Aula 4", videoUrl: "https://vimeo.com/1" });
    expect(lesson.video?.provider).toBe("vimeo");
    const c = call();
    expect(c.url).toBe(`${BASE}/courses/c1/lessons`);
    expect(c.init.method).toBe("POST");
    expect(c.body).toEqual({ moduleId: "m1", title: "Aula 4", videoUrl: "https://vimeo.com/1" });
  });

  it("asks the gate with the customer's externalId, escaped", async () => {
    fetchMock.mockResolvedValueOnce(json({ key: "plano-pro", hasAccess: true, state: "active", grants: [] }));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
    const got = await infi.access.check("ana@loja.com", "plano-pro");
    expect(got.hasAccess).toBe(true);
    expect(call().url).toBe(`${BASE}/access/customers/ana%40loja.com/keys/plano-pro`);
  });

  it("sets what a product grants with PUT", async () => {
    fetchMock.mockResolvedValueOnce(json({ rules: [{ key: "curso-x", window: "days", days: 365 }] }));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
    await infi.access.setProductRules("p1", [{ key: "curso-x", window: "days", days: 365 }]);
    expect(call().init.method).toBe("PUT");
    expect(call().url).toBe(`${BASE}/products/p1/access`);
  });

  it("verifies who owns a buyer token without putting it in the URL", async () => {
    fetchMock.mockResolvedValueOnce(json({ valid: true, origin: "code", customer: { id: "u", externalId: "ana" } }));
    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
    const v = await infi.buyerTokens.verify("bt_abc");
    expect(v.customer?.externalId).toBe("ana");
    expect(call().url).toBe(`${BASE}/v1/buyer-tokens/verify`);
    expect(call().url).not.toContain("bt_");
    expect(call().body).toEqual({ token: "bt_abc" });
  });

  it("refuses to run without a secret key", async () => {
    const infi = new Infi({ apiUrl: BASE });
    await expect(infi.courses.list()).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
