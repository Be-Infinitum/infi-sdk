import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInfiAuth } from "./auth.js";

const TOKEN = `bt_${"a".repeat(64)}`;
const verified = {
  buyer: { email: "ana@x.test", customerIds: ["c1"], externalIds: ["ana@x.test"] },
  origin: "oauth",
  scope: "portal:read",
  expiresAt: "2026-10-28T00:00:00Z",
  access: [{ productId: "p1", key: "ecommerce/club", name: "Clube", kind: "subscription" }],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function idToken(nonce: string): string {
  const part = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${part({ alg: "RS256" })}.${part({ nonce, sub: "c1" })}.sig`;
}

/** The browser's cookie jar, fed by Set-Cookie. */
function browser() {
  const jar = new Map<string, { value: string; attrs: string }>();
  return {
    jar,
    keep(res: Response) {
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split("; ");
        const [k, ...v] = pair!.split("=");
        if (/Max-Age=0/.test(c)) jar.delete(k!);
        else jar.set(k!, { value: decodeURIComponent(v.join("=")), attrs: attrs.join("; ") });
      }
      return res;
    },
    req(url: string, method = "GET") {
      const cookie = [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v.value)}`).join("; ");
      return new Request(url, { method, headers: cookie ? { cookie } : {} });
    },
  };
}

describe("createInfiAuth", () => {
  let calls: [string, RequestInit][];
  let nonceSeen = "";
  beforeEach(() => {
    calls = [];
    global.fetch = vi.fn(async (url: string | URL, init: RequestInit) => {
      const u = String(url);
      calls.push([u, init]);
      if (u.endsWith("/oauth/token")) {
        return json({ access_token: TOKEN, token_type: "Bearer", expires_in: 2592000, id_token: idToken(nonceSeen), scope: "openid" });
      }
      if (u.endsWith("/verify")) {
        const h = init.headers as Record<string, string>;
        return h["X-Buyer-Token"] === TOKEN ? json(verified) : json({ error_code: "portal_token_invalid", message: "x" }, 401);
      }
      return json({ revoked: 1 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  const auth = () =>
    createInfiAuth({ secretKey: "sk_test_x", apiUrl: "https://api.test", clientId: "ic_site", siteUrl: "https://loja.test" });

  it("starts at Infi's authorize with PKCE, and remembers only what the callback needs", async () => {
    const b = browser();
    const res = b.keep(await auth().handle(b.req("https://loja.test/api/infi/auth/sign-in?next=/members&locale=en")));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://api.test/oauth/authorize");
    expect(to.searchParams.get("client_id")).toBe("ic_site");
    expect(to.searchParams.get("redirect_uri")).toBe("https://loja.test/api/infi/auth/callback");
    expect(to.searchParams.get("code_challenge_method")).toBe("S256");
    expect(to.searchParams.get("ui_locales")).toBe("en");
    const flow = JSON.parse(b.jar.get("infi_oauth")!.value);
    expect(flow.next).toBe("/members");
    expect(to.searchParams.get("state")).toBe(flow.state);
    expect(to.toString()).not.toContain(flow.verifier);
    expect(b.jar.get("infi_oauth")!.attrs).toContain("HttpOnly");
    expect(b.jar.get("infi_oauth")!.attrs).toContain("Path=/api/infi/auth");
    expect(b.jar.get("infi_oauth")!.attrs).toContain("Secure");
  });

  it("never sends the person to another site after signing in", async () => {
    const b = browser();
    b.keep(await auth().handle(b.req("https://loja.test/api/infi/auth/sign-in?next=//evil.test")));
    expect(JSON.parse(b.jar.get("infi_oauth")!.value).next).toBe("/");
  });

  it("trades the code with the sk_ and the verifier, keeps the token HttpOnly, and never returns it", async () => {
    const a = auth();
    const b = browser();
    b.keep(await a.handle(b.req("https://loja.test/api/infi/auth/sign-in?next=/members")));
    const flow = JSON.parse(b.jar.get("infi_oauth")!.value);
    nonceSeen = flow.nonce;
    const res = b.keep(await a.handle(b.req(`https://loja.test/api/infi/auth/callback?code=ac_1&state=${flow.state}`)));
    expect(res.headers.get("location")).toBe("https://loja.test/members");
    const form = new URLSearchParams(String(calls.find(([u]) => u.endsWith("/oauth/token"))![1].body));
    expect(form.get("client_secret")).toBe("sk_test_x");
    expect(form.get("code_verifier")).toBe(flow.verifier);
    expect(b.jar.get("infi_buyer")!.value).toBe(TOKEN);
    expect(b.jar.get("infi_buyer")!.attrs).toMatch(/HttpOnly/);
    expect(b.jar.has("infi_oauth")).toBe(false);

    const session = await (await a.handle(b.req("https://loja.test/api/infi/auth"))).json();
    expect(JSON.stringify(session)).not.toContain(TOKEN);
    expect(session.buyer.buyer.email).toBe("ana@x.test");
    // A server component hands its request headers (Next's headers()).
    const headers = new Headers({ cookie: `infi_buyer=${TOKEN}` });
    expect((await a.getBuyer(headers))?.has("ecommerce/club")).toBe(true);
  });

  it("refuses a callback this browser did not start", async () => {
    const b = browser();
    const res = await auth().handle(b.req("https://loja.test/api/infi/auth/callback?code=ac_1&state=forged"));
    expect(res.headers.get("location")).toBe("https://loja.test/?infi_error=invalid_state");
    expect(calls.some(([u]) => u.endsWith("/oauth/token"))).toBe(false);
  });

  it("brings a store's refusal back to the page, with nothing signed in", async () => {
    const a = auth();
    const b = browser();
    b.keep(await a.handle(b.req("https://loja.test/api/infi/auth/sign-in?next=/members")));
    const flow = JSON.parse(b.jar.get("infi_oauth")!.value);
    const res = b.keep(
      await a.handle(
        b.req(`https://loja.test/api/infi/auth/callback?error=access_denied&error_description=not_a_customer&state=${flow.state}`),
      ),
    );
    expect(res.headers.get("location")).toBe("https://loja.test/members?infi_error=not_a_customer");
    expect(b.jar.has("infi_buyer")).toBe(false);
  });

  it("sign out drops the cookie and revokes that one token", async () => {
    const b = browser();
    b.jar.set("infi_buyer", { value: TOKEN, attrs: "" });
    const res = b.keep(await auth().handle(b.req("https://loja.test/api/infi/auth", "DELETE")));
    expect((await res.json()).buyer).toBeNull();
    expect(b.jar.has("infi_buyer")).toBe(false);
    const revoke = calls.find(([u]) => u.endsWith("/v1/buyer-tokens/revoke"))!;
    expect(JSON.parse(String(revoke[1].body))).toEqual({ token: TOKEN });
  });
});
