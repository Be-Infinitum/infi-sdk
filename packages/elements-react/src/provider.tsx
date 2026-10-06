import type { Appearance, SignalsClient } from "@beinfi/elements";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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
  /**
   * Your publishable key (`pk_…`), for `<InfiSignals>` and `<FeedbackElement>`
   * (what visitors do and say, sent to your Infi dashboard). Safe in the page:
   * it only ever writes signals and opens checkouts. Never your `sk_`.
   */
  publishableKey?: string;
}

/** The signals client `<InfiSignals>` started, shared with the other elements. */
interface SignalsSlot {
  signals: SignalsClient | null;
  setSignals: (client: SignalsClient | null) => void;
}

export const InfiContext = createContext<InfiContextValue | null>(null);
export const SignalsContext = createContext<SignalsSlot | null>(null);

/**
 * Wrap the part of your app that shows Infi elements. Elements in preview mode
 * need no provider (it only lends them its appearance and locale). The only key
 * it takes is the publishable one, for signals: the checkout and the portal
 * run in Infi's frames, and whatever needs your `sk_` stays on your server.
 */
export function InfiProvider({ children, ...value }: InfiContextValue & { children: ReactNode }) {
  const memo = useMemo(
    () => value,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value.slug, value.environment, value.appUrl, value.locale, value.publishableKey, JSON.stringify(value.appearance ?? {})],
  );
  const [signals, setSignals] = useState<SignalsClient | null>(null);
  const slot = useMemo(() => ({ signals, setSignals }), [signals]);
  return (
    <InfiContext.Provider value={memo}>
      <SignalsContext.Provider value={slot}>{children}</SignalsContext.Provider>
    </InfiContext.Provider>
  );
}

export function useInfi(): InfiContextValue {
  const ctx = useContext(InfiContext);
  if (!ctx) throw new Error("Infi elements must be rendered inside <InfiProvider>.");
  return ctx;
}
