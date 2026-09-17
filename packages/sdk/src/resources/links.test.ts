import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Infi } from "../client.js";

const BASE = "http://localhost:8088";
const APP = "http://localhost:3000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(): Infi {
  return new Infi({ secretKey: "sk_test_x", apiUrl: BASE, appUrl: APP });
}

describe("infi.links", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  // list() needed a slug to produce any url at all, and returned "" without one.
  // The server sends the url now, so the slug is a fallback, not a requirement.
  it("list returns the server url with no slug passed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        links: [{ id: "lnk_1", token: "plink_abc", url: `${APP}/pay/acme/links/plink_abc` }],
      }),
    );

    const links = await client().links.list("prd_1");
    expect(links[0]?.url).toBe(`${APP}/pay/acme/links/plink_abc`);
  });

  // A promotional price reaches a buyer only through a link that names its
  // version — nothing resolves into a non-default version on its own.
  it("create(productId, { productVersionId }) sells the named version", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "lnk_1", token: "plink_abc", productVersionId: "ver_promo" }, 201),
    );

    const link = await client().links.create("prd_1", {
      slug: "acme",
      productVersionId: "ver_promo",
    });

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ productVersionId: "ver_promo" });
    expect(link.productVersionId).toBe("ver_promo");
  });

  // The inline form is one call from nothing to a payable URL: no productId to
  // look up first, and no slug, because the secret key already says who you are.
  it("create({ product }) posts the inline form and returns the server's url", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: "lnk_1",
          productId: "prd_1",
          token: "plink_abc",
          active: true,
          url: `${APP}/pay/acme/links/plink_abc`,
          productVersionId: "ver_1",
        },
        201,
      ),
    );

    const link = await client().links.create({
      product: {
        key: "pro",
        name: "Pro",
        pricingModel: "subscription",
        billingCycle: "monthly",
        basePrice: "299.00",
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(`${BASE}/metering/payment-links`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      product: { key: "pro", basePrice: "299.00" },
    });
    expect(link.url).toBe(`${APP}/pay/acme/links/plink_abc`);
    // The pin is what makes a later price change miss links already shared.
    expect(link.productVersionId).toBe("ver_1");
  });

  // Building the URL locally is exactly what this form exists to avoid, so a
  // response without one has to fail loudly rather than be guessed at.
  it("create({ product }) refuses a response that carries no url", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "lnk_1", token: "plink_abc" }, 201));

    await expect(
      client().links.create({ product: { key: "pro", pricingModel: "one_time" } }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("create({ product }) never asks for a slug", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "lnk_1", token: "plink_abc", url: `${APP}/pay/acme/links/plink_abc` }, 201),
    );

    await expect(
      client().links.create({ product: { key: "pro", pricingModel: "one_time" } }),
    ).resolves.toBeTruthy();
  });

  // The positional form predates the server sending a url; when it does send
  // one, that is the address of record rather than the locally built guess.
  it("create(productId, opts) prefers the server url over the local build", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "lnk_1", token: "plink_abc", url: `${APP}/pay/real-slug/links/plink_abc` }, 201),
    );

    const link = await client().links.create("prd_1", { slug: "stale-slug" });
    expect(link.url).toBe(`${APP}/pay/real-slug/links/plink_abc`);
  });

  it("create POSTs the product's payment-links and returns a shareable url", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { id: "lnk_1", productId: "prd_1", token: "plink_abc", active: true },
        201,
      ),
    );

    const link = await client().links.create("prd_1", { slug: "acme" });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(`${BASE}/metering/products/prd_1/payment-links`);
    expect(init.method).toBe("POST");
    // The whole point of the resource: what you send someone, ready to paste.
    expect(link.url).toBe(`${APP}/pay/acme/links/plink_abc`);
    expect(link.id).toBe("lnk_1");
  });

  it("create sends the secret key and honours an idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "lnk_1", token: "t" }, 201));

    await client().links.create("prd_1", { slug: "acme" }, "idem-1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer sk_test_x");
    expect(headers.get("Idempotency-Key")).toBe("idem-1");
  });

  it("create sends no body unless a return URL is given — the auto-mint path never did", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "lnk_1", token: "t" }, 201));
    await client().links.create("prd_1", { slug: "acme" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body ?? undefined).toBeUndefined();
  });

  it("create forwards successUrl and cancelUrl, and returns them on the link", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: "lnk_1",
          token: "t",
          successUrl: "https://shop.acme.com/obrigado",
          cancelUrl: "https://shop.acme.com/carrinho",
        },
        201,
      ),
    );
    const link = await client().links.create("prd_1", {
      slug: "acme",
      successUrl: "https://shop.acme.com/obrigado",
      cancelUrl: "https://shop.acme.com/carrinho",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      successUrl: "https://shop.acme.com/obrigado",
      cancelUrl: "https://shop.acme.com/carrinho",
    });
    expect(link.successUrl).toBe("https://shop.acme.com/obrigado");
  });

  it("list unwraps the links envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ links: [{ id: "lnk_1", token: "t1" }, { id: "lnk_2", token: "t2" }] }),
    );

    const links = await client().links.list("prd_1", { slug: "acme" });

    expect(links.map((l) => l.id)).toEqual(["lnk_1", "lnk_2"]);
    expect(links[0]!.url).toBe(`${APP}/pay/acme/links/t1`);
  });

  it("list without a slug returns no url rather than a broken one", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ links: [{ id: "lnk_1", token: "t1" }] }));

    const links = await client().links.list("prd_1");

    expect(links[0]!.url).toBe("");
  });

  it("revoke DELETEs the link", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client().links.revoke("prd_1", "lnk_1");

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(`${BASE}/metering/products/prd_1/payment-links/lnk_1`);
    expect(init.method).toBe("DELETE");
  });

  it("url-encodes ids and tokens", () => {
    expect(client().links.urlFor("acme/co", "a b")).toBe(`${APP}/pay/acme%2Fco/links/a%20b`);
  });
});
