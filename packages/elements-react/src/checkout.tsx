import { InfiCheckoutEmbed, type InfiCheckoutEmbedProps } from "@beinfi/checkout/react";
import { useInfi } from "./provider.js";

export type CheckoutElementProps = Omit<
  InfiCheckoutEmbedProps,
  "slug" | "environment" | "appUrl" | "locale" | "theme" | "themeOptions"
>;

/**
 * The Infi checkout: pix and card (card fields in the provider's own frame).
 * Give it a payment link token (one product) or an invoice your server
 * created. The coupon field comes before the payment method.
 *
 * `onComplete` is not proof of payment: deliver on the `payment.confirmed`
 * webhook, or ask your server.
 */
export function CheckoutElement(props: CheckoutElementProps) {
  const infi = useInfi();
  const { theme, accentColor, backgroundColor } = infi.appearance ?? {};
  return (
    <InfiCheckoutEmbed
      {...props}
      slug={infi.slug}
      environment={infi.environment}
      appUrl={infi.appUrl}
      locale={infi.locale}
      theme={theme}
      themeOptions={accentColor || backgroundColor ? { accentColor, backgroundColor } : undefined}
    />
  );
}
