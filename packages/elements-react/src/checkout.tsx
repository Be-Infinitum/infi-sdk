import { InfiCheckoutEmbed, type InfiCheckoutEmbedProps } from "./InfiCheckoutEmbed.js";
import { useElementLocale } from "./locale.js";
import { useInfi } from "./provider.js";

export type CheckoutElementProps = Omit<
  InfiCheckoutEmbedProps,
  "slug" | "environment" | "appUrl" | "locale" | "theme" | "themeOptions"
> & {
  /** pt-BR or en; defaults to the provider's, then <html lang>, then the browser. */
  locale?: string;
};

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
  const { locale: localeProp, ...rest } = props;
  const locale = useElementLocale(localeProp);
  const { theme, accentColor, backgroundColor } = infi.appearance ?? {};
  return (
    <InfiCheckoutEmbed
      {...rest}
      slug={infi.slug}
      environment={infi.environment}
      appUrl={infi.appUrl}
      locale={locale}
      theme={theme}
      themeOptions={accentColor || backgroundColor ? { accentColor, backgroundColor } : undefined}
    />
  );
}
