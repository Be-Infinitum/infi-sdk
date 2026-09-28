import { createPortalEmbed } from "@beinfi/elements";
import { useEffect, useRef, type CSSProperties } from "react";
import { signInHref } from "./auth.js";
import { useElementLocale } from "./locale.js";
import { useInfi } from "./provider.js";

export interface PortalElementProps {
  /** The token you kept from last time (first-party, httpOnly cookie is best). Never localStorage. */
  token?: string | null;
  /** Stores with their own login: ask your server, which mints one with `infi.buyerTokens.create`. */
  getToken?: () => Promise<string | null>;
  /** The buyer logged in or the token was renewed: keep it first-party. */
  onToken?: (token: string, expiresAt: string) => void;
  onSignedOut?: () => void;
  /** pt-BR or en; defaults to the provider's, then <html lang>, then the browser. */
  locale?: string;
  /** Your auth route, where "Entrar com Infi" starts (default `/api/infi/auth`). */
  authEndpoint?: string;
  /** Replace the default (go to "Entrar com Infi" and come back here). */
  onSignIn?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The buyer's "Minhas compras" at this store, in Infi's frame: signed in with
 * Infi (the `token` your server keeps) or your own login via `getToken`, orders with receipts,
 * downloads, subscriptions, cancel at period end, change card, refund within
 * the guarantee. Sensitive actions ask for a fresh code inside the frame.
 */
export function PortalElement(props: PortalElementProps) {
  const infi = useInfi();
  const host = useRef<HTMLDivElement>(null);
  // Callbacks are usually inline arrows: keep the latest without remounting
  // the frame, which would log the buyer out of what they were doing.
  const latest = useRef(props);
  latest.current = props;
  const mode = infi.environment === "production" ? "live" : "sandbox";
  const locale = useElementLocale(props.locale);

  useEffect(() => {
    if (!host.current) return;
    const handle = createPortalEmbed(host.current, {
      slug: infi.slug,
      mode,
      appUrl: infi.appUrl,
      locale,
      token: latest.current.token ?? null,
      getToken: latest.current.getToken ? () => latest.current.getToken!() : undefined,
      onToken: (t, exp) => latest.current.onToken?.(t, exp),
      onSignedOut: () => latest.current.onSignedOut?.(),
      onSignIn: () => {
        const p = latest.current;
        if (p.onSignIn) return p.onSignIn();
        globalThis.location.assign(signInHref({ endpoint: p.authEndpoint, locale }));
      },
    });
    return () => handle.destroy();
  }, [infi.slug, mode, infi.appUrl, locale]);

  return <div ref={host} className={props.className} style={props.style} />;
}
