import { useEffect, useImperativeHandle, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import {
  createCheckoutEmbed,
  type CheckoutEmbedHandle,
  type CreateCheckoutEmbedOptions,
} from "../core.js";
import type { EmbedSource } from "../url.js";

export interface InfiCheckoutEmbedProps
  extends Omit<CreateCheckoutEmbedOptions, "mode">,
    Partial<Record<never, never>> {
  /**
   * Your tenant slug. **Optional with `linkToken`** — the token is globally
   * unique and carries its own tenant, so it resolves the merchant on its own.
   * **Required with `invoiceId`**, which is a per-tenant uuid and names no
   * merchant.
   */
  slug?: string;
  /** The `plink_…` token of a payment link. One product, no server call per sale. */
  linkToken?: string;
  /** An invoice your server created with `infi.checkout()`. Use for carts. */
  invoiceId?: string;
  /** The URL `links.create()` returned, verbatim. Replaces slug + linkToken. */
  href?: string;
  /**
   * Which Infi environment to charge against. `sandbox` takes no real money.
   * There is no default on purpose: defaulting to production is how a test
   * integration quietly charges live cards.
   */
  environment: "sandbox" | "production";
  /** Rendered until the checkout has loaded. */
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Imperative controls — see `useCheckoutEmbedControls()`. */
  ref?: Ref<CheckoutEmbedHandle | null>;
}

/**
 * Infi checkout, embedded in your own page.
 *
 * ```tsx
 * <InfiCheckoutEmbed
 *   slug="acme"
 *   linkToken="plink_…"
 *   environment="sandbox"
 *   onComplete={({ invoiceId }) => router.push(`/obrigado?i=${invoiceId}`)}
 * />
 * ```
 *
 * The buyer pays without leaving your page. Card details are entered in the
 * payment provider's own frame, so they never touch your site and your PCI
 * scope does not change.
 *
 * `onComplete` tells you the payer finished — it is **not** proof of payment.
 * Ship the goods when the `payment.confirmed` webhook arrives.
 */
export function InfiCheckoutEmbed({
  slug,
  linkToken,
  invoiceId,
  href,
  environment,
  fallback,
  className,
  style,
  ref,
  ...options
}: InfiCheckoutEmbedProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CheckoutEmbedHandle | null>(null);
  // Callbacks are usually inline arrows, so a new identity every render. Keep
  // them in a ref and the effect never re-runs — remounting the iframe mid-
  // checkout would drop the buyer's charge.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useImperativeHandle<CheckoutEmbedHandle | null, CheckoutEmbedHandle | null>(
    ref,
    () => handleRef.current,
    [],
  );

  const mode = environment === "production" ? "live" : "sandbox";
  const sourceKey = href ?? `${slug ?? ""}|${linkToken ?? ""}|${invoiceId ?? ""}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const source = (
      href !== undefined
        ? { href }
        : linkToken !== undefined
          ? { slug: slug ?? "", linkToken }
          : { slug: slug ?? "", invoiceId: invoiceId ?? "" }
    ) as EmbedSource;

    const handle = createCheckoutEmbed(host, source, {
      ...optionsRef.current,
      mode,
      onStateChange: (state, method) => optionsRef.current.onStateChange?.(state, method),
      onComplete: (payload) => optionsRef.current.onComplete?.(payload),
      onPaymentPending: (info) => optionsRef.current.onPaymentPending?.(info),
      onPaymentError: (error) => optionsRef.current.onPaymentError?.(error),
      onResize: (height) => optionsRef.current.onResize?.(height),
    });
    handleRef.current = handle;

    return () => {
      handleRef.current = null;
      handle.destroy();
    };
    // StrictMode mounts twice; destroy() removes the iframe, so the second
    // mount starts clean rather than stacking a second checkout.
  }, [sourceKey, mode, href, slug, linkToken, invoiceId]);

  return (
    <div ref={hostRef} className={className} style={style} data-infi-checkout>
      {fallback}
    </div>
  );
}
