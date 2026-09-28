import type { ElementPreview } from "@beinfi/elements";
import type { CSSProperties } from "react";
import { CheckoutPreview } from "./checkout-preview.js";
import { InfiCheckoutEmbed, type InfiCheckoutEmbedProps } from "./InfiCheckoutEmbed.js";
import { useElementLocale } from "./locale.js";
import { useInfi } from "./provider.js";

type CheckoutLiveProps = Omit<
  InfiCheckoutEmbedProps,
  "slug" | "environment" | "appUrl" | "locale" | "theme" | "themeOptions"
> & {
  /** pt-BR or en; defaults to the provider's, then <html lang>, then the browser. */
  locale?: string;
  preview?: undefined;
};

type CheckoutPreviewModeProps = {
  /** Draw a look-alike from this draft; nothing loads from Infi and nothing charges. */
  preview: ElementPreview;
  locale?: string;
  className?: string;
  style?: CSSProperties;
};

export type CheckoutElementProps = CheckoutLiveProps | CheckoutPreviewModeProps;

/**
 * The Infi checkout: pix and card (card fields in the provider's own frame).
 * Give it a payment link token (one product) or an invoice your server
 * created. The coupon field comes before the payment method.
 *
 * `onComplete` is not proof of payment: deliver on the `payment.confirmed`
 * webhook, or ask your server.
 *
 * With `preview`, it is drawn here from the draft — no frame, no request.
 */
export function CheckoutElement(props: CheckoutElementProps) {
  const locale = useElementLocale(props.locale);
  if (props.preview !== undefined) {
    return <CheckoutPreview preview={props.preview} locale={locale} className={props.className} style={props.style} />;
  }
  return <LiveCheckout {...props} locale={locale} />;
}

function LiveCheckout({ preview: _preview, ...rest }: CheckoutLiveProps & { locale: string }) {
  const infi = useInfi();
  const { theme, accentColor, backgroundColor, font, radius } = infi.appearance ?? {};
  const themed = accentColor || backgroundColor || font || radius;
  return (
    <InfiCheckoutEmbed
      {...rest}
      slug={infi.slug}
      environment={infi.environment}
      appUrl={infi.appUrl}
      theme={theme}
      themeOptions={themed ? { accentColor, backgroundColor, font, radius } : undefined}
    />
  );
}
