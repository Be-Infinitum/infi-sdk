import { afterEach, describe, expect, it } from "vitest";
import { detectColorScheme } from "./theme.js";
import { portalEmbedUrl } from "./embed.js";

afterEach(() => {
  const html = document.documentElement;
  html.className = "";
  html.removeAttribute("data-theme");
  html.style.colorScheme = "";
});

describe("color scheme", () => {
  it("an explicit theme wins", () => {
    document.documentElement.classList.add("dark");
    expect(detectColorScheme("light")).toBe("light");
  });

  it.each([
    ["class dark", (h: HTMLElement) => h.classList.add("dark"), "dark"],
    ["class light", (h: HTMLElement) => h.classList.add("light"), "light"],
    ["data-theme dark", (h: HTMLElement) => h.setAttribute("data-theme", "dark"), "dark"],
    ["color-scheme dark", (h: HTMLElement) => (h.style.colorScheme = "dark"), "dark"],
    ["nothing said: follow the OS", () => {}, "system"],
  ])("reads the site's %s", (_name, set, want) => {
    set(document.documentElement);
    expect(detectColorScheme()).toBe(want);
  });

  it("the portal frame carries it", () => {
    document.documentElement.classList.add("dark");
    const url = portalEmbedUrl({ slug: "loja", mode: "live", embedId: "e1", parentOrigin: "https://x.test" });
    expect(new URL(url).searchParams.get("theme")).toBe("dark");
  });
});
