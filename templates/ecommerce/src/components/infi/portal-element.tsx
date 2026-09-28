"use client";

import { createPortalEmbed } from "@beinfi/elements-core";
import { useEffect, useRef } from "react";

/**
 * The buyer portal, in Infi's frame. UI only: the calls live in
 * @beinfi/elements-core and on Infi's server.
 *
 * The token is never kept in localStorage nor in a URL: the frame posts it
 * here, this component hands it to /api/portal-token (an httpOnly cookie on
 * this site), and the page passes it back on the next visit.
 *
 * Stores with their own login: pass `getToken` instead, calling your server,
 * which mints one with `infi.buyerTokens.create({ externalId })`.
 */
export function PortalElement(props: {
  slug: string;
  mode: "sandbox" | "live";
  initialToken?: string | null;
  appUrl?: string;
  getToken?: () => Promise<string | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const handle = createPortalEmbed(ref.current, {
      slug: props.slug,
      mode: props.mode,
      appUrl: props.appUrl,
      token: props.initialToken ?? null,
      getToken: props.getToken,
      onToken: (token, expiresAt) => {
        void fetch("/api/portal-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, expiresAt }),
        });
      },
      onSignedOut: () => void fetch("/api/portal-token", { method: "DELETE" }),
    });
    return () => handle.destroy();
  }, [props.slug, props.mode, props.appUrl, props.initialToken, props.getToken]);
  return <div ref={ref} />;
}
