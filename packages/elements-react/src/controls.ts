import { useRef, type RefObject } from "react";
import type { CheckoutEmbedHandle } from "@beinfi/elements";

/**
 * A ref for driving the checkout from your own UI — your own Pay button, or
 * prefilling the payer's CPF once you know it.
 *
 * ```tsx
 * const checkout = useCheckoutEmbedControls();
 * <CheckoutElement ref={checkout} … />
 * <button onClick={() => checkout.current?.submit()}>Pagar</button>
 * ```
 */
export function useCheckoutEmbedControls(): RefObject<CheckoutEmbedHandle | null> {
  return useRef<CheckoutEmbedHandle | null>(null);
}
