"use client";

import { PortalElement } from "@beinfi/elements-react";

/**
 * The token never goes to localStorage or a URL: it is kept in an httpOnly
 * cookie on this site (/api/portal-token) and handed back on the next visit.
 *
 * Stores with their own login: pass `getToken` to <PortalElement> instead,
 * calling your server, which mints one with `infi.buyerTokens.create({ externalId })`.
 */
export function Portal({ token }: { token: string | null }) {
  return (
    <PortalElement
      token={token}
      onToken={(t, expiresAt) =>
        void fetch("/api/portal-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t, expiresAt }),
        })
      }
      onSignedOut={() => void fetch("/api/portal-token", { method: "DELETE" })}
    />
  );
}
