"use client";

import { CheckoutElement } from "@beinfi/elements-react";
import { useRouter } from "next/navigation";

/**
 * `onComplete` means the buyer finished — NOT that the money arrived. The
 * thank-you page asks the server; delivery rides on the payment.confirmed
 * webhook (src/app/api/webhooks/infi/route.ts).
 */
export function Checkout({ linkToken }: { linkToken: string }) {
  const router = useRouter();
  return (
    <CheckoutElement
      linkToken={linkToken}
      onComplete={({ invoiceId }) => router.push(invoiceId ? `/obrigado?pedido=${encodeURIComponent(invoiceId)}` : "/obrigado")}
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}
    />
  );
}
