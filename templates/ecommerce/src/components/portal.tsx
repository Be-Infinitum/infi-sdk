"use client";

import { PortalElement, notifyAuthChanged } from "@beinfi/elements-react";

/**
 * One session for the store and its portal: the token the site's own login
 * keeps (an HttpOnly cookie, handed in by the server). Signed out, the frame
 * offers "Entrar com Infi", which comes back here.
 */
export function Portal({ token }: { token: string | null }) {
  return (
    <PortalElement
      token={token}
      onSignedOut={() => void fetch("/api/infi/auth", { method: "DELETE" }).then(notifyAuthChanged)}
    />
  );
}
