/**
 * The languages the elements speak — the frames (checkout, portal, login) and
 * the few words the React components draw themselves. A new language is a
 * new entry in MESSAGES here and a new messages folder in the Infi frontend.
 */
export const SUPPORTED_LOCALES = ["pt-BR", "en"] as const;
export type InfiLocale = (typeof SUPPORTED_LOCALES)[number];
export const FALLBACK_LOCALE: InfiLocale = "pt-BR";

/** Narrow any BCP-47 tag to a supported one; `undefined` when none fits. */
export function matchLocale(tag: string | null | undefined): InfiLocale | undefined {
  const t = (tag ?? "").trim().toLowerCase();
  if (t === "pt" || t.startsWith("pt-")) return "pt-BR";
  if (t === "en" || t.startsWith("en-")) return "en";
  return undefined;
}

/**
 * The language to show when the site did not say: the page's own
 * `<html lang>` (the site's language) first, then the buyer's browser.
 * `undefined` off the browser, or when nothing is supported.
 */
export function detectLocale(): InfiLocale | undefined {
  const doc = globalThis.document;
  const fromPage = matchLocale(doc?.documentElement?.lang);
  if (fromPage) return fromPage;
  const nav = globalThis.navigator;
  for (const tag of nav?.languages ?? (nav?.language ? [nav.language] : [])) {
    const m = matchLocale(tag);
    if (m) return m;
  }
  return undefined;
}

/** Explicit (prop, provider) wins; else detected; else the fallback. */
export function resolveLocale(explicit?: string | null): InfiLocale {
  return matchLocale(explicit) ?? detectLocale() ?? FALLBACK_LOCALE;
}

export interface ElementMessages {
  buy: string;
  subscribe: string;
  cycle: Record<"weekly" | "monthly" | "annual", string>;
  checkoutTitle: string;
  portalTitle: string;
  loginTitle: string;
}

export const MESSAGES: Record<InfiLocale, ElementMessages> = {
  "pt-BR": {
    buy: "Comprar",
    subscribe: "Assinar",
    cycle: { weekly: "/semana", monthly: "/mês", annual: "/ano" },
    checkoutTitle: "Pagamento",
    portalTitle: "Minhas compras",
    loginTitle: "Entrar",
  },
  en: {
    buy: "Buy",
    subscribe: "Subscribe",
    cycle: { weekly: "/week", monthly: "/month", annual: "/year" },
    checkoutTitle: "Checkout",
    portalTitle: "My purchases",
    loginTitle: "Sign in",
  },
};

export function messagesFor(locale?: string | null): ElementMessages {
  return MESSAGES[matchLocale(locale) ?? FALLBACK_LOCALE];
}
