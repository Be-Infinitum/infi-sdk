import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { destroy, mount, scan } from "./loader.js";

/**
 * The loader is the surface a merchant hand-writes, so every test here is about
 * a mistake they will actually make: a wrong attribute name, a missing
 * environment, a callback that does not exist. Silence on any of those is how
 * the mistake reaches production.
 */

function div(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("mount", () => {
  it("mounts from a link token alone", () => {
    const el = div({
      "data-infi-checkout-link-token": "plink_1",
      "data-infi-checkout-environment": "sandbox",
    });
    const handle = mount(el);
    expect(handle).not.toBeNull();
    expect(el.querySelector("iframe")?.getAttribute("src")).toContain("/embed/sandbox/links/plink_1");
    handle?.destroy();
  });

  it("refuses to guess the environment", () => {
    // Defaulting to production is how a test integration charges live cards.
    const el = div({ "data-infi-checkout-link-token": "plink_1" });
    expect(mount(el)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("environment"));
  });

  it("refuses an invoice id with no slug, and says why", () => {
    const el = div({
      "data-infi-checkout-invoice-id": "inv_1",
      "data-infi-checkout-environment": "sandbox",
    });
    expect(mount(el)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("does not identify the merchant"));
  });

  it("does not mount the same element twice", () => {
    // A script tag included twice, or a re-scan, must not stack two checkouts.
    const el = div({
      "data-infi-checkout-link-token": "plink_1",
      "data-infi-checkout-environment": "sandbox",
    });
    const first = mount(el);
    const second = mount(el);
    expect(second).toBe(first);
    expect(el.querySelectorAll("iframe")).toHaveLength(1);
    first?.destroy();
  });

  it("warns when a callback attribute names nothing", () => {
    const el = div({
      "data-infi-checkout-link-token": "plink_1",
      "data-infi-checkout-environment": "sandbox",
      "data-infi-checkout-on-complete": "handleCheckoutDone",
    });
    const handle = mount(el);
    // The typo is the whole failure: the merchant thinks they wired fulfilment.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("handleCheckoutDone"));
    handle?.destroy();
  });

  it("resolves a callback that does exist", () => {
    (globalThis as Record<string, unknown>).onInfiDone = vi.fn();
    const el = div({
      "data-infi-checkout-link-token": "plink_1",
      "data-infi-checkout-environment": "sandbox",
      "data-infi-checkout-on-complete": "onInfiDone",
    });
    const handle = mount(el);
    expect(warn).not.toHaveBeenCalled();
    handle?.destroy();
    delete (globalThis as Record<string, unknown>).onInfiDone;
  });

  it("passes the theme knobs through, and rejects a hostile colour", () => {
    const el = div({
      "data-infi-checkout-link-token": "plink_1",
      "data-infi-checkout-environment": "sandbox",
      "data-infi-checkout-theme-accent-color": "red; background: url(evil)",
    });
    // The colour validator throws rather than letting arbitrary text reach CSS.
    expect(() => mount(el)).toThrow(/hex color/);
  });

  it("reads prefill and the return url", () => {
    const el = div({
      "data-infi-checkout-link-token": "plink_1",
      "data-infi-checkout-environment": "production",
      "data-infi-checkout-prefill-email": "buyer@example.com",
      "data-infi-checkout-prefill-tax-id": "52998224725",
    });
    const handle = mount(el);
    const src = new URL(el.querySelector("iframe")!.getAttribute("src")!);
    expect(src.searchParams.get("email")).toBe("buyer@example.com");
    expect(src.searchParams.get("taxId")).toBe("52998224725");
    handle?.destroy();
  });
});

describe("scan", () => {
  it("mounts several independent embeds on one page", () => {
    div({ "data-infi-checkout-link-token": "plink_a", "data-infi-checkout-environment": "sandbox" });
    div({ "data-infi-checkout-link-token": "plink_b", "data-infi-checkout-environment": "sandbox" });
    const handles = scan();
    expect(handles).toHaveLength(2);
    // Different embed ids, or one embed's messages would reach the other.
    expect(handles[0]!.embedId).not.toBe(handles[1]!.embedId);
    handles.forEach((h) => h.destroy());
  });

  it("skips what it already mounted", () => {
    div({ "data-infi-checkout-link-token": "plink_a", "data-infi-checkout-environment": "sandbox" });
    expect(scan()).toHaveLength(1);
    expect(scan()).toHaveLength(0);
  });
});

describe("destroy", () => {
  it("removes the iframe and allows a remount", () => {
    const el = div({
      "data-infi-checkout-link-token": "plink_1",
      "data-infi-checkout-environment": "sandbox",
    });
    mount(el);
    destroy(el);
    expect(el.querySelector("iframe")).toBeNull();
    expect(mount(el)).not.toBeNull();
  });
});
