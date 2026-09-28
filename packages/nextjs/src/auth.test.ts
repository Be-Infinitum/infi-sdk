import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, { value: string; opts?: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string, opts: Record<string, unknown>) => jar.set(n, { value, opts }),
    delete: (n: string) => jar.delete(n),
  }),
}));

const { createInfiAuth } = await import("./auth.js");

const TOKEN = `bt_${"a".repeat(64)}`;
const verified = {
  buyer: { email: "ana@x.test", customerIds: ["c1"], externalIds: ["ana@x.test"] },
  origin: "code",
  scope: "portal:read",
  expiresAt: "2026-10-28T00:00:00Z",
  access: [{ productId: "p1", key: "ecommerce/curso", name: "Curso", kind: "subscription" }],
};

describe("createInfiAuth", () => {
  let calls: [string, RequestInit][];
  beforeEach(() => {
    jar.clear();
    calls = [];
    global.fetch = vi.fn(async (url: string | URL, init: RequestInit) => {
      calls.push([String(url), init]);
      if (String(url).endsWith("/verify")) {
        const h = init.headers as Record<string, string>;
        return h["X-Buyer-Token"] === TOKEN
          ? new Response(JSON.stringify(verified), { status: 200, headers: { "Content-Type": "application/json" } })
          : new Response(JSON.stringify({ error_code: "portal_token_invalid", message: "x" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ revoked: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  const auth = () => createInfiAuth({ secretKey: "sk_test_x", apiUrl: "https://api.test" });

  it("keeps a verified token in an HttpOnly cookie until Infi says it expires, and never returns it", async () => {
    const a = auth();
    const res = await a.handlers.POST(new Request("http://loja.test/api/infi/auth", { method: "POST", body: JSON.stringify({ token: TOKEN }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(body.buyer.buyer.email).toBe("ana@x.test");
    const c = jar.get("infi_buyer")!;
    expect(c.value).toBe(TOKEN);
    expect(c.opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect((c.opts!.expires as Date).toISOString()).toBe("2026-10-28T00:00:00.000Z");

    const buyer = await a.getBuyer();
    expect(buyer?.has("ecommerce/curso")).toBe(true);
    expect(buyer?.has("ecommerce/ebook")).toBe(false);
  });

  it("refuses a token Infi does not vouch for, and sets no cookie", async () => {
    const res = await auth().handlers.POST(
      new Request("http://loja.test/api/infi/auth", { method: "POST", body: JSON.stringify({ token: `bt_${"b".repeat(64)}` }) }),
    );
    expect(res.status).toBe(401);
    expect(jar.has("infi_buyer")).toBe(false);
  });

  it("sign out drops the cookie and revokes that one token", async () => {
    jar.set("infi_buyer", { value: TOKEN });
    const res = await auth().handlers.DELETE();
    expect((await res.json()).buyer).toBeNull();
    expect(jar.has("infi_buyer")).toBe(false);
    const revoke = calls.find(([u]) => u.endsWith("/v1/buyer-tokens/revoke"))!;
    expect(JSON.parse(String(revoke[1].body))).toEqual({ token: TOKEN });
  });
});
