import { appearanceCssVars, readableOn, type Appearance } from "@beinfi/elements";
import { useContext, type CSSProperties } from "react";
import { InfiContext, type InfiAppearance } from "./provider.js";

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The root style of a natively drawn element: the appearance's CSS variables
 * plus the properties that read them. The provider's appearance wins field by
 * field over `fallback` (what a server read carried, like `store.appearance`):
 * the site chose it explicitly; `override` (a preview's appearance) wins over both.
 */
export function useAppearanceStyle(
  fallback?: Partial<Appearance> | null,
  override?: Partial<Appearance> | null,
): CSSProperties {
  const ctx = useContext(InfiContext);
  return appearanceStyle({ ...clean(fallback), ...clean(ctx?.appearance), ...clean(override) });
}

function clean(a: InfiAppearance | Partial<Appearance> | null | undefined): Partial<Appearance> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a ?? {})) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out as Partial<Appearance>;
}

export function appearanceStyle(a?: Partial<Appearance> | null): CSSProperties {
  return {
    ...(appearanceCssVars(a) as CSSProperties),
    background: "var(--infi-background, transparent)",
    color: "var(--infi-foreground, inherit)",
    fontFamily: "var(--infi-font, inherit)",
  };
}

/** A product's own accent on its card or page (already effective on a server read). */
export function accentStyle(accent?: string | null): CSSProperties {
  if (!accent || !HEX_COLOR.test(accent)) return {};
  return { "--infi-accent": accent, "--infi-accent-foreground": readableOn(accent) } as CSSProperties;
}

export const buttonStyle: CSSProperties = {
  display: "inline-block",
  padding: "0.625rem 1rem",
  textAlign: "center",
  border: 0,
  borderRadius: "var(--infi-button-radius, var(--infi-radius, 12px))",
  background: "var(--infi-accent, #0a0a0a)",
  color: "var(--infi-accent-foreground, #fff)",
  font: "inherit",
  textDecoration: "none",
  cursor: "pointer",
};
