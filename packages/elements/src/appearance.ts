/**
 * Appearance in three levels — business, product, link — the most specific
 * wins (backend `dashboard-v1-api.md` §1). The server resolves it for the
 * buyer-facing reads; the dashboard editor re-resolves unsaved edits here with
 * the same table, so the preview and the published page never disagree.
 */

export const APPEARANCE_FONTS = ["system", "inter", "geist", "roboto", "poppins", "lora"] as const;
export type AppearanceFont = (typeof APPEARANCE_FONTS)[number];

export const APPEARANCE_RADII = ["none", "small", "medium", "large", "full"] as const;
export type AppearanceRadius = (typeof APPEARANCE_RADII)[number];

/** The effective values an element draws with (what the public reads carry). */
export interface Appearance {
  accentColor: string;
  backgroundColor: string;
  font: AppearanceFont;
  radius: AppearanceRadius;
}

/** `null`, `undefined` and `""` all mean "inherit from the level below". */
export interface AppearanceLevels {
  business?: { accentColor?: string | null; font?: string | null; radius?: string | null } | null;
  product?: { accentColor?: string | null } | null;
  link?: { accentColor?: string | null; backgroundColor?: string | null; font?: string | null } | null;
}

export type AppearanceSource = "link" | "product" | "business" | "default";

export type ResolvedAppearance = {
  [K in keyof Appearance]: { value: Appearance[K]; source: AppearanceSource };
};

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  accentColor: "#5B21B6",
  backgroundColor: "#FFFFFF",
  font: "system",
  radius: "medium",
});

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// An invalid value inherits instead of throwing: this runs on every keystroke
// in the editor, and whatever reaches here ends up in a stylesheet.
function isColor(v: unknown): v is string {
  return typeof v === "string" && HEX_COLOR.test(v);
}
function isFont(v: unknown): v is AppearanceFont {
  return (APPEARANCE_FONTS as readonly unknown[]).includes(v);
}
function isRadius(v: unknown): v is AppearanceRadius {
  return (APPEARANCE_RADII as readonly unknown[]).includes(v);
}

function pick<T>(
  field: keyof Appearance,
  valid: (v: unknown) => v is T,
  candidates: [AppearanceSource, unknown][],
): { value: T; source: AppearanceSource } {
  for (const [source, value] of candidates) {
    if (valid(value)) return { value, source };
  }
  return { value: DEFAULT_APPEARANCE[field] as T, source: "default" };
}

export function resolveAppearance(levels: AppearanceLevels = {}): ResolvedAppearance {
  const b = levels.business ?? {};
  const p = levels.product ?? {};
  const l = levels.link ?? {};
  return {
    accentColor: pick("accentColor", isColor, [
      ["link", l.accentColor],
      ["product", p.accentColor],
      ["business", b.accentColor],
    ]),
    backgroundColor: pick("backgroundColor", isColor, [["link", l.backgroundColor]]),
    font: pick("font", isFont, [
      ["link", l.font],
      ["business", b.font],
    ]),
    radius: pick("radius", isRadius, [["business", b.radius]]),
  };
}

/** Drop the sources: what `InfiProvider appearance` and the public reads take. */
export function effectiveAppearance(resolved: ResolvedAppearance): Appearance {
  return {
    accentColor: resolved.accentColor.value,
    backgroundColor: resolved.backgroundColor.value,
    font: resolved.font.value,
    radius: resolved.radius.value,
  };
}

/**
 * The elements do not load web fonts: the page does (or the fallback shows).
 * Each stack ends in a generic family so a missing font still reads right.
 */
export const FONT_STACKS: Readonly<Record<AppearanceFont, string>> = Object.freeze({
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  inter: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  geist: '"Geist", "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  roboto: '"Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
  poppins: '"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif',
  lora: '"Lora", Georgia, "Times New Roman", serif',
});

/**
 * Containers and buttons round differently at the ends of the scale: `full`
 * is a pill button, and a 9999px card would be a stadium.
 */
export const RADIUS_LENGTHS: Readonly<Record<AppearanceRadius, { container: string; button: string }>> =
  Object.freeze({
    none: { container: "0px", button: "0px" },
    small: { container: "4px", button: "4px" },
    medium: { container: "8px", button: "8px" },
    large: { container: "16px", button: "12px" },
    full: { container: "24px", button: "9999px" },
  });

function expand(hex: string): [number, number, number] {
  const h = hex.slice(1);
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance (WCAG), to pick readable text over a chosen color. */
function luminance(hex: string): number {
  const [r, g, b] = expand(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string): "#FFFFFF" | "#0A0A0A" {
  return luminance(hex) > 0.4 ? "#0A0A0A" : "#FFFFFF";
}

/**
 * The CSS custom properties the elements read, for whichever fields are set
 * (and valid). Unset fields emit nothing, so the site's own `--infi-*` wins.
 */
export function appearanceCssVars(a: Partial<Appearance> | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!a) return vars;
  if (isColor(a.accentColor)) {
    vars["--infi-accent"] = a.accentColor;
    vars["--infi-accent-foreground"] = readableOn(a.accentColor);
  }
  if (isColor(a.backgroundColor)) {
    const dark = readableOn(a.backgroundColor) === "#FFFFFF";
    vars["--infi-background"] = a.backgroundColor;
    vars["--infi-foreground"] = dark ? "#FAFAFA" : "#0A0A0A";
    vars["--infi-muted"] = dark ? "#A1A1AA" : "#71717A";
    vars["--infi-border"] = dark ? "#3F3F46" : "#E4E4E7";
  }
  if (isFont(a.font)) vars["--infi-font"] = FONT_STACKS[a.font];
  if (isRadius(a.radius)) {
    vars["--infi-radius"] = RADIUS_LENGTHS[a.radius].container;
    vars["--infi-button-radius"] = RADIUS_LENGTHS[a.radius].button;
  }
  return vars;
}
