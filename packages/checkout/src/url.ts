import { embedPathPrefix, resolveAppBase, type CheckoutMode } from "./hosts.js";

/**
 * What to check out. A discriminated union so the invalid combinations — a
 * token *and* an invoice, or neither — are a type error rather than a 404 the
 * buyer discovers.
 *
 * `linkToken` is one product and needs no server call per purchase; `invoiceId`
 * is a cart or a custom amount and comes from `infi.checkout()` on your server.
 */
export type EmbedSource =
  /** The `plink_…` token of a payment link, plus your tenant slug. */
  | { readonly slug: string; readonly linkToken: string; readonly invoiceId?: never; readonly href?: never }
  /** An invoice your server already created, plus your tenant slug. */
  | { readonly slug: string; readonly invoiceId: string; readonly linkToken?: never; readonly href?: never }
  /** The URL `links.create()` handed you, verbatim. Slug and token are read from it. */
  | { readonly href: string; readonly slug?: never; readonly linkToken?: never; readonly invoiceId?: never };

/** Colors accepted for the theme knobs. */
export type ThemeOptions = {
  /** `#rgb` or `#rrggbb`. Anything else throws — an unvalidated color reaches
   *  a stylesheet, and a stylesheet is not a safe place for arbitrary text. */
  readonly backgroundColor?: string;
  readonly accentColor?: string;
};

export interface EmbedUrlOptions {
  readonly mode: CheckoutMode;
  /** Per-iframe id, echoed on every message so two embeds stay independent. */
  readonly embedId: string;
  /** The exact origin the child must target when it posts back. */
  readonly parentOrigin: string;
  /** Override the host — local development against the frontend on :4003. */
  readonly appUrl?: string;
  /**
   * BCP-47 tag. It must travel in the URL: the checkout's locale cookie is
   * `SameSite=Lax`, so it is never sent to a third-party iframe and the embed
   * would otherwise always fall back to `Accept-Language`.
   */
  readonly locale?: string;
  readonly theme?: "light" | "dark" | "system";
  readonly themeOptions?: ThemeOptions;
  readonly hidePrice?: boolean;
  readonly prefill?: {
    readonly email?: string;
    readonly name?: string;
    /** CPF or CNPJ. Pix on Asaas refuses a payer without one. */
    readonly taxId?: string;
  };
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** `links.urlFor` shape: `{appBase}/pay/{slug}/links/{token}`, live or sandbox. */
const HREF_LINK = /^\/pay(?:\/sandbox)?\/([^/]+)\/links\/([^/?#]+)$/;
const HREF_INVOICE = /^\/pay(?:\/sandbox)?\/([^/]+)\/invoices\/([^/?#]+)$/;

export class InvalidEmbedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmbedUrlError";
  }
}

function requireNonEmpty(value: string | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    // Fail loudly. Interpolating an empty slug produces a URL that 404s in the
    // buyer's face with nothing in the console to explain it.
    throw new InvalidEmbedUrlError(`${field} is required and was empty.`);
  }
  return trimmed;
}

function color(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!HEX_COLOR.test(value.trim())) {
    throw new InvalidEmbedUrlError(
      `${field} must be a hex color like "#0f172a" or "#0f1"; got ${JSON.stringify(value)}.`,
    );
  }
  return value.trim();
}

/** Pull `{ slug, linkToken | invoiceId, appUrl }` out of a hosted-checkout URL. */
export function parseCheckoutHref(href: string): {
  slug: string;
  linkToken?: string;
  invoiceId?: string;
  appUrl: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    throw new InvalidEmbedUrlError(`href is not a URL: ${JSON.stringify(href)}.`);
  }

  const link = HREF_LINK.exec(parsed.pathname);
  if (link?.[1] && link[2]) {
    return { slug: decodeURIComponent(link[1]), linkToken: decodeURIComponent(link[2]), appUrl: parsed.origin };
  }
  const invoice = HREF_INVOICE.exec(parsed.pathname);
  if (invoice?.[1] && invoice[2]) {
    return { slug: decodeURIComponent(invoice[1]), invoiceId: decodeURIComponent(invoice[2]), appUrl: parsed.origin };
  }
  throw new InvalidEmbedUrlError(
    `href must look like /pay/{slug}/links/{token} or /pay/{slug}/invoices/{id}; got ${parsed.pathname}.`,
  );
}

/**
 * Turn props into the iframe `src`. The single place a host is chosen, so the
 * one bug this repo has already shipped twice — a browser feature hardcoding a
 * production host and 404ing under a sandbox key — has one place to live.
 */
export function buildEmbedUrl(source: EmbedSource, options: EmbedUrlOptions): string {
  let slug: string;
  let linkToken: string | undefined;
  let invoiceId: string | undefined;
  let appUrl = options.appUrl;

  if ("href" in source && source.href !== undefined) {
    const parsed = parseCheckoutHref(source.href);
    slug = parsed.slug;
    linkToken = parsed.linkToken;
    invoiceId = parsed.invoiceId;
    // An explicit appUrl still wins, so a merchant can point a production href
    // at a local frontend without rewriting the string.
    appUrl = appUrl ?? parsed.appUrl;
  } else {
    slug = requireNonEmpty(source.slug, "slug");
    linkToken = source.linkToken;
    invoiceId = source.invoiceId;
  }

  const base = resolveAppBase(options.mode, appUrl);
  const prefix = embedPathPrefix(options.mode);
  const enc = encodeURIComponent;

  let path: string;
  if (linkToken !== undefined) {
    path = `${prefix}/${enc(slug)}/links/${enc(requireNonEmpty(linkToken, "linkToken"))}`;
  } else if (invoiceId !== undefined) {
    path = `${prefix}/${enc(slug)}/invoices/${enc(requireNonEmpty(invoiceId, "invoiceId"))}`;
  } else {
    throw new InvalidEmbedUrlError("Pass linkToken, invoiceId or href.");
  }

  const q = new URLSearchParams();
  q.set("embedId", requireNonEmpty(options.embedId, "embedId"));
  q.set("parentOrigin", requireNonEmpty(options.parentOrigin, "parentOrigin"));

  if (options.locale) q.set("locale", options.locale);
  if (options.theme) q.set("theme", options.theme);

  const bg = color(options.themeOptions?.backgroundColor, "themeOptions.backgroundColor");
  const accent = color(options.themeOptions?.accentColor, "themeOptions.accentColor");
  if (bg) q.set("bg", bg);
  if (accent) q.set("accent", accent);

  if (options.hidePrice) q.set("hidePrice", "1");

  // Prefill rides the URL because it must be present on first paint; the child
  // never echoes it back, and it is the merchant's own data about their own buyer.
  if (options.prefill?.email) q.set("email", options.prefill.email);
  if (options.prefill?.name) q.set("name", options.prefill.name);
  if (options.prefill?.taxId) q.set("taxId", options.prefill.taxId);

  return `${base}${path}?${q.toString()}`;
}
