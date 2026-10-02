import { FALLBACK_LOCALE, matchLocale, resolveLocale, type InfiLocale } from "@beinfi/elements";
import { useContext, useSyncExternalStore } from "react";
import { InfiContext } from "./provider.js";

function subscribe(onChange: () => void): () => void {
  const doc = globalThis.document;
  if (!doc) return () => {};
  // A site's language switcher usually just rewrites <html lang>.
  const observer = new MutationObserver(onChange);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
  globalThis.addEventListener("languagechange", onChange);
  return () => {
    observer.disconnect();
    globalThis.removeEventListener("languagechange", onChange);
  };
}

/**
 * The language an element shows: its own `locale` prop, else the provider's,
 * else the site's `<html lang>`, else the buyer's browser, else pt-BR. The
 * server renders the explicit one or pt-BR; detection takes over after
 * hydration, so the two never disagree mid-hydration.
 */
export function useElementLocale(explicit?: string): InfiLocale {
  const ctx = useContext(InfiContext);
  const chosen = matchLocale(explicit) ?? matchLocale(ctx?.locale);
  const detected = useSyncExternalStore(
    subscribe,
    () => resolveLocale(undefined),
    () => FALLBACK_LOCALE,
  );
  return chosen ?? detected;
}
