/**
 * The PortalElement's frame: Infi's portal embed route inside the store's page
 * (decisoes.md, Portal). The site hands the frame the buyer token it keeps
 * (signed in with Infi, ADR 0007) by postMessage — same checks as
 * `@beinfi/checkout` (frame source, exact origin, namespace, embed id). With no
 * token the frame asks the site to start "Entrar com Infi" (`sign_in`): a
 * frame cannot navigate the page. No third-party cookie.
 *
 * The frame is served by the Infi frontend at `{app}/embed/{slug}/portal`
 * (`{app}/embed/sandbox/{slug}/portal` on sandbox).
 */

import { embedPathPrefix, resolveAppBase } from "./checkout/hosts.js";
import { messagesFor, resolveLocale } from "./locale.js";

export const PORTAL_PROTOCOL = "portal/v1";

/** Same hosts as the checkout: the portal frame is served by the same app. */
export type PortalMode = "sandbox" | "live";

type Envelope = { __infi: typeof PORTAL_PROTOCOL; embedId: string };

/** Frame → site. */
export type PortalToParent = Envelope &
  (
    | { type: "ready" }
    | { type: "resize"; height: number }
    /** The buyer logged in (or the token was renewed): persist it first-party. */
    | { type: "token"; token: string; expiresAt: string }
    /** Signed out, or the token died: forget it. */
    | { type: "signed_out" }
    /** Nobody is signed in: the site starts "Entrar com Infi" (the frame cannot navigate the page). */
    | { type: "sign_in" }
  );

/** Site → frame. */
export type ParentToPortal = Envelope & { type: "set_token"; token: string | null };

export function isPortalFrame(data: unknown, embedId: string): data is PortalToParent {
  if (!data || typeof data !== "object") return false;
  const d = data as { __infi?: unknown; embedId?: unknown; type?: unknown };
  return d.__infi === PORTAL_PROTOCOL && d.embedId === embedId && typeof d.type === "string";
}

export interface PortalEmbedOptions {
  slug: string;
  mode: PortalMode;
  appUrl?: string;
  /** The token the site kept from last time, if any. */
  token?: string | null;
  /** Path (c): the site's own login mints one on its server. */
  getToken?: () => Promise<string | null>;
  onToken?: (token: string, expiresAt: string) => void;
  onSignedOut?: () => void;
  /** Nobody is signed in and the person asked to: start "Entrar com Infi". */
  onSignIn?: () => void;
  onResize?: (height: number) => void;
  locale?: string;
}

export interface PortalEmbedHandle {
  iframe: HTMLIFrameElement;
  setToken(token: string | null): void;
  destroy(): void;
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `inf_ptl_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function portalEmbedUrl(opts: PortalEmbedOptions & { embedId: string; parentOrigin: string }): string {
  // Same routing as the checkout: the host picks the deployment, the prefix
  // the environment (/embed/sandbox on sandbox).
  const u = new URL(
    `${resolveAppBase(opts.mode, opts.appUrl)}${embedPathPrefix(opts.mode)}/${encodeURIComponent(opts.slug)}/portal`,
  );
  u.searchParams.set("embedId", opts.embedId);
  u.searchParams.set("parentOrigin", opts.parentOrigin);
  // Always sent: the frame cannot see the site's <html lang>, and its own
  // fallback (Accept-Language) is the browser, not the store.
  u.searchParams.set("locale", resolveLocale(opts.locale));
  // The token NEVER goes in the URL: it is posted after the handshake.
  return u.toString();
}

export function createPortalEmbed(target: HTMLElement, opts: PortalEmbedOptions): PortalEmbedHandle {
  const embedId = randomId();
  const expectedOrigin = resolveAppBase(opts.mode, opts.appUrl);
  const iframe = document.createElement("iframe");
  iframe.src = portalEmbedUrl({ ...opts, embedId, parentOrigin: globalThis.location?.origin ?? "" });
  const words = messagesFor(resolveLocale(opts.locale));
  iframe.title = words.portalTitle;
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  // The card change mounts the provider's hosted fields inside.
  iframe.setAttribute("allow", `payment ${expectedOrigin}; publickey-credentials-get ${expectedOrigin}`);

  let ready = false;
  let pendingToken: string | null | undefined = opts.token ?? undefined;
  let destroyed = false;

  const post = (token: string | null) => {
    const msg: ParentToPortal = { __infi: PORTAL_PROTOCOL, embedId, type: "set_token", token };
    iframe.contentWindow?.postMessage(msg, expectedOrigin);
  };

  async function onMessage(event: MessageEvent) {
    if (event.source !== iframe.contentWindow) return;
    if (event.origin !== expectedOrigin) return;
    if (!isPortalFrame(event.data, embedId)) return;
    const frame = event.data;
    switch (frame.type) {
      case "ready": {
        ready = true;
        if (pendingToken === undefined && opts.getToken) pendingToken = await opts.getToken();
        if (pendingToken !== undefined && !destroyed) post(pendingToken);
        break;
      }
      case "resize":
        iframe.style.height = `${frame.height}px`;
        opts.onResize?.(frame.height);
        break;
      case "token":
        opts.onToken?.(frame.token, frame.expiresAt);
        break;
      case "signed_out":
        opts.onSignedOut?.();
        break;
      case "sign_in":
        opts.onSignIn?.();
        break;
    }
  }

  globalThis.addEventListener("message", onMessage);
  target.appendChild(iframe);

  return {
    iframe,
    setToken(token) {
      pendingToken = token;
      if (ready) post(token);
    },
    destroy() {
      destroyed = true;
      globalThis.removeEventListener("message", onMessage);
      iframe.remove();
    },
  };
}
