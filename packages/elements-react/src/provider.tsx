import type { Appearance } from "@beinfi/elements";
import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * How the elements look: the effective `Appearance` (a public read's
 * `appearance`, or `effectiveAppearance(resolveAppearance(levels))` in an
 * editor), any subset of it, and `theme` for the checkout frame. Colors are
 * `#rgb`/`#rrggbb` — the frames refuse anything else.
 */
export interface InfiAppearance extends Partial<Appearance> {
  theme?: "light" | "dark" | "system";
}

export interface InfiContextValue {
  /** Your tenant slug (`/pay/{slug}`), from `INFI_TENANT_SLUG`. */
  slug: string;
  /** No default on purpose: defaulting to production is how a test charges a live card. */
  environment: "sandbox" | "production";
  /** Override the Infi app host (local frontend). */
  appUrl?: string;
  /**
   * pt-BR or en (any regional tag narrows). Leave it out to follow the site's
   * `<html lang>`, then the buyer's browser. Each element also takes `locale`.
   */
  locale?: string;
  appearance?: InfiAppearance;
}

export const InfiContext = createContext<InfiContextValue | null>(null);

/**
 * Wrap the part of your app that shows Infi elements. Elements in preview mode
 * need no provider (it only lends them its appearance and locale). Carries no key — the
 * elements need none: the checkout and the portal run in Infi's frames, and
 * whatever needs your `sk_` stays on your server.
 */
export function InfiProvider({ children, ...value }: InfiContextValue & { children: ReactNode }) {
  const memo = useMemo(
    () => value,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value.slug, value.environment, value.appUrl, value.locale, JSON.stringify(value.appearance ?? {})],
  );
  return <InfiContext.Provider value={memo}>{children}</InfiContext.Provider>;
}

export function useInfi(): InfiContextValue {
  const ctx = useContext(InfiContext);
  if (!ctx) throw new Error("Infi elements must be rendered inside <InfiProvider>.");
  return ctx;
}
