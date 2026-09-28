import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLocale, matchLocale, messagesFor, resolveLocale } from "./locale.js";
import { portalEmbedUrl } from "./embed.js";

afterEach(() => {
  document.documentElement.lang = "";
  vi.unstubAllGlobals();
});

describe("locale", () => {
  it.each([
    ["pt", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["EN-us", "en"],
    ["es", undefined],
    ["", undefined],
  ])("matches %s to %s", (tag, want) => {
    expect(matchLocale(tag)).toBe(want);
  });

  it("the site's <html lang> wins over the browser", () => {
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    document.documentElement.lang = "pt-BR";
    expect(detectLocale()).toBe("pt-BR");
  });

  it("with no page language, the browser's first supported one", () => {
    vi.stubGlobal("navigator", { languages: ["fr-FR", "en-GB", "pt-BR"] });
    expect(detectLocale()).toBe("en");
  });

  it("an explicit locale beats detection; nothing supported falls back to pt-BR", () => {
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    vi.stubGlobal("navigator", { languages: ["de-DE"] });
    expect(resolveLocale(undefined)).toBe("pt-BR");
    expect(resolveLocale("de")).toBe("pt-BR");
  });

  it("every frame carries the resolved language in its URL", () => {
    document.documentElement.lang = "en";
    const url = portalEmbedUrl({ slug: "loja", mode: "live", view: "login", embedId: "e1", parentOrigin: "https://x.test" });
    expect(new URL(url).searchParams.get("locale")).toBe("en");
  });

  it("speaks both languages", () => {
    expect(messagesFor("en").subscribe).toBe("Subscribe");
    expect(messagesFor("pt-BR").cycle.monthly).toBe("/mês");
  });
});
