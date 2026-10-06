/**
 * The color scheme a frame should use, so a dark site does not get a white
 * box in the middle. Explicit (provider `appearance.theme`) wins; otherwise
 * the site's own signal:
 *  - a `dark`/`light` class or `data-theme` on <html> (next-themes, shadcn);
 *  - else `color-scheme` on <html>;
 *  - else `system`, which the frame resolves with `prefers-color-scheme`,
 *    like a site that follows the OS.
 */
export type ColorScheme = "light" | "dark" | "system";

export function detectColorScheme(explicit?: ColorScheme | null): ColorScheme {
  if (explicit) return explicit;
  const html = globalThis.document?.documentElement;
  if (!html) return "system";
  const attr = (html.getAttribute("data-theme") ?? "").toLowerCase();
  if (html.classList.contains("dark") || attr === "dark") return "dark";
  if (html.classList.contains("light") || attr === "light") return "light";
  const declared = globalThis.getComputedStyle?.(html).colorScheme?.trim();
  if (declared === "dark") return "dark";
  if (declared === "light") return "light";
  return "system";
}
