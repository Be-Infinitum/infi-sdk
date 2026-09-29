/**
 * Legacy entry point. The checkout embed now lives in `@beinfi/elements`
 * (and its React component in `@beinfi/elements-react`); this package
 * re-exports it under the names it always had, so existing integrations keep
 * working. New code imports from `@beinfi/elements`.
 */
export {
  createCheckoutEmbed,
  buildEmbedUrl,
  parseCheckoutHref,
  InvalidEmbedUrlError,
  embedPathPrefix,
  resolveAppBase,
  LIVE_APP_BASE,
  SANDBOX_APP_BASE,
  CHECKOUT_PROTOCOL as PROTOCOL,
  isCheckoutFrame as isEmbedFrame,
  type CheckoutEmbedCallbacks,
  type CheckoutEmbedHandle,
  type CreateCheckoutEmbedOptions,
  type EmbedSource,
  type EmbedUrlOptions,
  type ThemeOptions,
  type CheckoutMode,
  type CheckoutState,
  type CompletePayload,
  type EmbedErrorCode,
  type EmbedRequestMethod,
  type EmbedToParent,
  type Envelope,
  type ParentToEmbed,
  type PaymentMethod,
} from "@beinfi/elements";
