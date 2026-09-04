import { describe, expect, it } from "vitest";
import { buildEmbedUrl, InvalidEmbedUrlError, parseCheckoutHref } from "./url.js";

const base = { mode: "sandbox" as const, embedId: "inf_emb_1", parentOrigin: "https://shop.acme.com" };

describe("buildEmbedUrl", () => {
  it("uses the sandbox host AND the sandbox path prefix", () => {
    const url = new URL(buildEmbedUrl({ slug: "acme", linkToken: "plink_abc" }, base));
    // The host picks the deployment; the prefix picks which API it talks to.
    // Getting either wrong is the bug this repo already shipped (audit #3).
    expect(url.origin).toBe("https://app-sandbox.beinfi.com");
    expect(url.pathname).toBe("/embed/sandbox/acme/links/plink_abc");
  });

  it("uses the live host and the bare prefix for live", () => {
    const url = new URL(buildEmbedUrl({ slug: "acme", linkToken: "plink_abc" }, { ...base, mode: "live" }));
    expect(url.origin).toBe("https://app.beinfi.com");
    expect(url.pathname).toBe("/embed/acme/links/plink_abc");
  });

  it("throws on an empty slug instead of interpolating undefined", () => {
    // Audit #11: checkout() once built `/pay/undefined/...` and 404'd silently.
    expect(() => buildEmbedUrl({ slug: "  ", linkToken: "plink_abc" }, base)).toThrow(InvalidEmbedUrlError);
  });

  it("throws on an empty link token", () => {
    expect(() => buildEmbedUrl({ slug: "acme", linkToken: "" }, base)).toThrow(InvalidEmbedUrlError);
  });

  it("builds the invoice (cart) form", () => {
    const url = new URL(buildEmbedUrl({ slug: "acme", invoiceId: "inv_1" }, base));
    expect(url.pathname).toBe("/embed/sandbox/acme/invoices/inv_1");
  });

  it("carries embedId and parentOrigin so the child can target its reply", () => {
    const url = new URL(buildEmbedUrl({ slug: "acme", linkToken: "plink_abc" }, base));
    expect(url.searchParams.get("embedId")).toBe("inf_emb_1");
    expect(url.searchParams.get("parentOrigin")).toBe("https://shop.acme.com");
  });

  it("passes locale in the URL, because the locale cookie is SameSite=Lax", () => {
    const url = new URL(buildEmbedUrl({ slug: "acme", linkToken: "p" }, { ...base, locale: "pt-BR" }));
    expect(url.searchParams.get("locale")).toBe("pt-BR");
  });

  it("rejects a non-hex accent colour rather than passing it to a stylesheet", () => {
    expect(() =>
      buildEmbedUrl({ slug: "acme", linkToken: "p" }, {
        ...base,
        themeOptions: { accentColor: "red; background: url(evil)" },
      }),
    ).toThrow(/hex color/);
  });

  it("accepts both hex shorthands", () => {
    const url = new URL(
      buildEmbedUrl({ slug: "acme", linkToken: "p" }, {
        ...base,
        themeOptions: { accentColor: "#0f1", backgroundColor: "#0f172a" },
      }),
    );
    expect(url.searchParams.get("accent")).toBe("#0f1");
    expect(url.searchParams.get("bg")).toBe("#0f172a");
  });

  it("escapes a slug that would otherwise break out of the path", () => {
    const url = new URL(buildEmbedUrl({ slug: "a/../b", linkToken: "p" }, base));
    expect(url.pathname).toBe("/embed/sandbox/a%2F..%2Fb/links/p");
  });

  it("takes the whole hosted URL as one prop", () => {
    const url = new URL(
      buildEmbedUrl({ href: "https://app.beinfi.com/pay/acme/links/plink_xyz" }, { ...base, mode: "live" }),
    );
    expect(url.origin).toBe("https://app.beinfi.com");
    expect(url.pathname).toBe("/embed/acme/links/plink_xyz");
  });

  it("lets an explicit appUrl beat the host in the href, for local dev", () => {
    const url = new URL(
      buildEmbedUrl(
        { href: "https://app.beinfi.com/pay/acme/links/plink_xyz" },
        { ...base, mode: "live", appUrl: "http://localhost:4003" },
      ),
    );
    expect(url.origin).toBe("http://localhost:4003");
  });
});

describe("parseCheckoutHref", () => {
  it("reads slug and token out of a link URL", () => {
    expect(parseCheckoutHref("https://app.beinfi.com/pay/acme/links/plink_1")).toEqual({
      slug: "acme",
      linkToken: "plink_1",
      appUrl: "https://app.beinfi.com",
    });
  });

  it("reads the sandbox path form too", () => {
    const parsed = parseCheckoutHref("https://app-sandbox.beinfi.com/pay/sandbox/acme/invoices/inv_9");
    expect(parsed.slug).toBe("acme");
    expect(parsed.invoiceId).toBe("inv_9");
  });

  it("refuses a URL that is not a checkout URL", () => {
    expect(() => parseCheckoutHref("https://app.beinfi.com/dashboard")).toThrow(InvalidEmbedUrlError);
  });

  it("refuses a non-URL", () => {
    expect(() => parseCheckoutHref("plink_1")).toThrow(InvalidEmbedUrlError);
  });
});
