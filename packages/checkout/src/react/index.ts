import { useRef, type RefObject } from "react";
import type { CheckoutEmbedHandle } from "../core.js";

export { InfiCheckoutEmbed, type InfiCheckoutEmbedProps } from "./InfiCheckoutEmbed.js";
export type { CheckoutEmbedHandle } from "../core.js";
export type {
  CheckoutState,
  CompletePayload,
  EmbedErrorCode,
  PaymentMethod,
} from "../protocol.js";

/**
 * A ref for driving the embed from your own UI — your own Pay button, or
 * prefilling the payer's CPF once you know it.
 *
 * ```tsx
 * const checkout = useCheckoutEmbedControls();
 * <InfiCheckoutEmbed ref={checkout} … />
 * <button onClick={() => checkout.current?.submit()}>Pagar</button>
 * ```
 */
export function useCheckoutEmbedControls(): RefObject<CheckoutEmbedHandle | null> {
  return useRef<CheckoutEmbedHandle | null>(null);
}
