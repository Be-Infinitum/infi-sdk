import { describe, expect, it } from "vitest";
import { appearanceCssVars, effectiveAppearance, readableOn, resolveAppearance, type AppearanceLevels } from "./appearance.js";
import { buildEmbedUrl, InvalidEmbedUrlError } from "./checkout/url.js";

const all: AppearanceLevels = {
  business: { accentColor: "#0F766E", font: "inter", radius: "large" },
  product: { accentColor: "#2563EB" },
  link: { accentColor: "#DC2626", backgroundColor: "#111111", font: "lora" },
};

describe("resolveAppearance", () => {
  it("with nothing set, every field is the default", () => {
    expect(resolveAppearance({})).toEqual({
      accentColor: { value: "#5B21B6", source: "default" },
      backgroundColor: { value: "#FFFFFF", source: "default" },
      font: { value: "system", source: "default" },
      radius: { value: "medium", source: "default" },
    });
  });

  it("with every level set, the most specific level of each field wins", () => {
    expect(resolveAppearance(all)).toEqual({
      accentColor: { value: "#DC2626", source: "link" },
      backgroundColor: { value: "#111111", source: "link" },
      font: { value: "lora", source: "link" },
      radius: { value: "large", source: "business" },
    });
  });

  it.each<[string, AppearanceLevels, string, string]>([
    ["link", all, "#DC2626", "link"],
    ["product when the link inherits", { ...all, link: { accentColor: null } }, "#2563EB", "product"],
    ["business when link and product inherit", { ...all, link: {}, product: { accentColor: "" } }, "#0F766E", "business"],
    ["default when no level sets it", { business: { font: "inter" } }, "#5B21B6", "default"],
  ])("accentColor: %s", (_, levels, value, source) => {
    expect(resolveAppearance(levels).accentColor).toEqual({ value, source });
  });

  it("backgroundColor comes only from the link", () => {
    const r = resolveAppearance({ business: { accentColor: "#000000" }, product: { accentColor: "#000000" } });
    expect(r.backgroundColor).toEqual({ value: "#FFFFFF", source: "default" });
  });

  it("font skips the product: link, then business, then default", () => {
    expect(resolveAppearance({ ...all, link: { font: null } }).font).toEqual({ value: "inter", source: "business" });
    expect(resolveAppearance({ link: { font: "" } }).font).toEqual({ value: "system", source: "default" });
  });

  it("radius comes only from the business", () => {
    expect(resolveAppearance({ link: all.link }).radius).toEqual({ value: "medium", source: "default" });
  });

  it("an invalid value inherits instead of reaching a stylesheet", () => {
    const r = resolveAppearance({
      business: { accentColor: "#0F766E", font: "comic-sans", radius: "huge" },
      link: { accentColor: "red; background: url(x)", font: "inter" },
    });
    expect(r.accentColor).toEqual({ value: "#0F766E", source: "business" });
    expect(r.radius.source).toBe("default");
    expect(r.font).toEqual({ value: "inter", source: "link" });
  });

  it("the contract's example resolves as the API answers it", () => {
    const r = resolveAppearance({
      business: { accentColor: "#0F766E", font: null, radius: "large" },
      product: { accentColor: null },
      link: { accentColor: "#DC2626", backgroundColor: null, font: null },
    });
    expect(r).toEqual({
      accentColor: { value: "#DC2626", source: "link" },
      backgroundColor: { value: "#FFFFFF", source: "default" },
      font: { value: "system", source: "default" },
      radius: { value: "large", source: "business" },
    });
    expect(effectiveAppearance(r)).toEqual({
      accentColor: "#DC2626",
      backgroundColor: "#FFFFFF",
      font: "system",
      radius: "large",
    });
  });
});

describe("appearanceCssVars", () => {
  it("maps each set field to the elements' variables, in one place", () => {
    const vars = appearanceCssVars({ accentColor: "#FDE047", backgroundColor: "#0A0A0A", font: "lora", radius: "full" });
    expect(vars["--infi-accent"]).toBe("#FDE047");
    expect(vars["--infi-accent-foreground"]).toBe("#0A0A0A");
    expect(vars["--infi-background"]).toBe("#0A0A0A");
    expect(vars["--infi-foreground"]).toBe("#FAFAFA");
    expect(vars["--infi-font"]).toContain("Lora");
    expect(vars["--infi-radius"]).toBe("24px");
    expect(vars["--infi-button-radius"]).toBe("9999px");
  });

  it("emits nothing for unset or invalid fields, so the site's own CSS wins", () => {
    expect(appearanceCssVars(undefined)).toEqual({});
    expect(appearanceCssVars({ accentColor: "blue", font: "x" as never })).toEqual({});
  });

  it("picks readable text on the accent", () => {
    expect(readableOn("#5B21B6")).toBe("#FFFFFF");
    expect(readableOn("#FFF")).toBe("#0A0A0A");
  });
});

describe("checkout frame theme", () => {
  const base = { mode: "sandbox" as const, embedId: "e1", parentOrigin: "https://loja.test" };

  it("carries font and radius next to the colors", () => {
    const url = new URL(buildEmbedUrl({ linkToken: "plink_a" }, { ...base, themeOptions: { font: "inter", radius: "full" } }));
    expect(url.searchParams.get("font")).toBe("inter");
    expect(url.searchParams.get("radius")).toBe("full");
  });

  it("refuses a font outside the list", () => {
    expect(() => buildEmbedUrl({ linkToken: "plink_a" }, { ...base, themeOptions: { font: "x" as never } })).toThrow(
      InvalidEmbedUrlError,
    );
  });
});
