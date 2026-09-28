"use client";

import { PortalElement } from "@beinfi/elements-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Login to the member area: e-mail and a 6-digit code, inside Infi's frame
 * (PortalElement). The token goes to an httpOnly cookie on this site
 * (/api/portal-token) and never to localStorage or a URL.
 */
export function MemberLogin({ expired }: { expired?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    // A token Infi no longer accepts is dropped, so the next visit starts clean.
    if (expired) void fetch("/api/portal-token", { method: "DELETE" });
  }, [expired]);
  return (
    <PortalElement
      onToken={async (token, expiresAt) => {
        await fetch("/api/portal-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, expiresAt }),
        });
        router.refresh();
      }}
      onSignedOut={async () => {
        await fetch("/api/portal-token", { method: "DELETE" });
        router.refresh();
      }}
    />
  );
}
