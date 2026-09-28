"use client";

import { PortalElement, notifyAuthChanged } from "@beinfi/elements-react";

/**
 * One session for the store and its portal: a code typed here signs in to the
 * whole site (/api/infi/auth keeps it in an HttpOnly cookie), and a person
 * already signed in opens the portal without a second code.
 */
export function Portal({ token }: { token: string | null }) {
  return (
    <PortalElement
      token={token}
      onToken={(t) =>
        void fetch("/api/infi/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t }),
        }).then(notifyAuthChanged)
      }
      onSignedOut={() =>
        void fetch("/api/infi/auth", { method: "DELETE" }).then(notifyAuthChanged)
      }
    />
  );
}
