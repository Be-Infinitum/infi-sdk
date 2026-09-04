/**
 * The plain-`<script>` path.
 *
 * ```html
 * <script async defer src="https://app.beinfi.com/checkout/v1/loader.js"></script>
 * <div data-infi-checkout-link-token="plink_…"></div>
 * ```
 *
 * This exists for merchants with no build step — Framer, Webflow, WordPress, a
 * hand-written page — which in this market is a large share of them. It is a
 * thin adapter over `createCheckoutEmbed`: every React prop has a
 * `data-infi-checkout-*` twin, and callbacks name a function on `window`.
 *
 * Built as a self-contained IIFE, so it imports nothing at runtime.
 */
import { createCheckoutEmbed, type CheckoutEmbedHandle } from "./core.js";
import type { CheckoutMode } from "./hosts.js";
import type { EmbedSource } from "./url.js";

const ATTR = "data-infi-checkout";
const MOUNTED = "data-infi-checkout-mounted";

/** Elements we have already mounted, so a second script tag or a re-scan does
 *  not stack two checkouts on one div. */
const mounted = new WeakMap<Element, CheckoutEmbedHandle>();

function attr(el: Element, name: string): string | undefined {
  const value = el.getAttribute(`${ATTR}-${name}`);
  return value === null ? undefined : value;
}

/** `"true"`/`"false"` only. An absent attribute is absent, not false — that
 *  distinction matters for the tri-state ones. */
function bool(el: Element, name: string): boolean | undefined {
  const raw = attr(el, name);
  if (raw === undefined) return undefined;
  return raw === "true" || raw === "1";
}

/**
 * Resolve a callback named by attribute off `window`.
 *
 * A missing function is a merchant typo, and silently doing nothing is how that
 * typo survives to production — so it warns, once, naming the attribute and the
 * name it looked for.
 */
function fn(el: Element, name: string): ((...args: never[]) => void) | undefined {
  const ref = attr(el, name);
  if (!ref) return undefined;
  const candidate = (globalThis as Record<string, unknown>)[ref];
  if (typeof candidate !== "function") {
    console.warn(
      `[infi] ${ATTR}-${name}="${ref}" does not name a function on window. ` +
        "Define it before the loader runs, or the event is dropped.",
    );
    return undefined;
  }
  return candidate as (...args: never[]) => void;
}

function sourceFrom(el: Element): EmbedSource | null {
  const href = attr(el, "href");
  if (href) return { href };

  const linkToken = attr(el, "link-token");
  const slug = attr(el, "slug");
  if (linkToken) return slug ? { slug, linkToken } : { linkToken };

  const invoiceId = attr(el, "invoice-id");
  // An invoice id names no merchant, so the slug is not optional here. Say so
  // rather than mounting something that resolves to nothing.
  if (invoiceId) {
    if (!slug) {
      console.warn(
        `[infi] ${ATTR}-invoice-id needs ${ATTR}-slug too — an invoice id does ` +
          "not identify the merchant. Nothing mounted.",
      );
      return null;
    }
    return { slug, invoiceId };
  }
  return null;
}

/** Mount one element. Returns the handle, or null if it was already mounted or
 *  carries no usable target. */
export function mount(el: Element): CheckoutEmbedHandle | null {
  if (mounted.has(el)) return mounted.get(el) ?? null;

  const source = sourceFrom(el);
  if (!source) return null;

  const environment = attr(el, "environment");
  // No default. Defaulting to production is how a test integration quietly
  // charges live cards.
  if (environment !== "sandbox" && environment !== "production") {
    console.warn(
      `[infi] ${ATTR}-environment must be "sandbox" or "production". Nothing mounted.`,
    );
    return null;
  }
  const mode: CheckoutMode = environment === "production" ? "live" : "sandbox";

  const accentColor = attr(el, "theme-accent-color");
  const backgroundColor = attr(el, "theme-background-color");

  const handle = createCheckoutEmbed(el as HTMLElement, source, {
    mode,
    appUrl: attr(el, "app-url"),
    locale: attr(el, "locale"),
    theme: attr(el, "theme") as "light" | "dark" | "system" | undefined,
    themeOptions:
      accentColor || backgroundColor ? { accentColor, backgroundColor } : undefined,
    hidePrice: bool(el, "hide-price"),
    prefill: {
      email: attr(el, "prefill-email"),
      name: attr(el, "prefill-name"),
      taxId: attr(el, "prefill-tax-id"),
    },
    returnUrl: attr(el, "return-url"),
    skipRedirect: bool(el, "skip-redirect"),
    onComplete: fn(el, "on-complete") as never,
    onStateChange: fn(el, "on-state-change") as never,
    onPaymentPending: fn(el, "on-payment-pending") as never,
    onPaymentError: fn(el, "on-payment-error") as never,
  });

  mounted.set(el, handle);
  el.setAttribute(MOUNTED, "");
  return handle;
}

/** Tear one down, so a page builder removing the node does not leak a listener. */
export function destroy(el: Element): void {
  mounted.get(el)?.destroy();
  mounted.delete(el);
  el.removeAttribute(MOUNTED);
}

function targets(root: ParentNode): Element[] {
  return Array.from(
    root.querySelectorAll(
      `[${ATTR}-link-token]:not([${MOUNTED}]),` +
        `[${ATTR}-invoice-id]:not([${MOUNTED}]),` +
        `[${ATTR}-href]:not([${MOUNTED}])`,
    ),
  );
}

/** Mount everything currently on the page. */
export function scan(root: ParentNode = document): CheckoutEmbedHandle[] {
  return targets(root)
    .map((el) => mount(el))
    .filter((h): h is CheckoutEmbedHandle => h !== null);
}

/**
 * Watch for elements added later.
 *
 * Not optional: Framer, Webflow and every SPA page builder inject DOM after
 * load, so a one-shot scan finds nothing on exactly the sites this path exists
 * for. Also tears down on removal, since those builders swap sections in and
 * out while the page lives.
 */
function observe(): void {
  if (typeof MutationObserver === "undefined") return;
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof Element)) continue;
        if (node.hasAttribute(`${ATTR}-link-token`)) mount(node);
        scan(node);
      }
      for (const node of Array.from(record.removedNodes)) {
        if (node instanceof Element && mounted.has(node)) destroy(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

export function start(): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scan();
      observe();
    });
  } else {
    scan();
    observe();
  }
}
