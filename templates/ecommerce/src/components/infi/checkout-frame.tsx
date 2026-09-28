"use client";

import { InfiCheckoutEmbed } from "@beinfi/checkout/react";
import { useRouter } from "next/navigation";

/**
 * The Infi checkout inside this page. Pix and card are rendered by Infi; the
 * card number is typed in the payment provider's own frame, so it never
 * touches this site. The coupon field sits before the payment method.
 *
 * `onComplete` means the buyer finished — NOT that the money arrived. The
 * thank-you page asks the server; delivery rides on the payment.confirmed
 * webhook (see src/app/api/webhooks/infi/route.ts).
 */
export function CheckoutFrame(props: { linkToken: string; slug: string; environment: "sandbox" | "production" }) {
  const router = useRouter();
  return (
    <InfiCheckoutEmbed
      linkToken={props.linkToken}
      slug={props.slug}
      environment={props.environment}
      onComplete={({ invoiceId }) => router.push(invoiceId ? `/obrigado?pedido=${encodeURIComponent(invoiceId)}` : "/obrigado")}
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}
    />
  );
}
