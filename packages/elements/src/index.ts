/**
 * @beinfi/elements — Infi elements, headless (the Whop Elements model: a core
 * here, React components in @beinfi/elements-react).
 *
 * The checkout embed is re-exported from @beinfi/checkout, which stays as the
 * legacy entry point; new code imports from here.
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
  PROTOCOL as CHECKOUT_PROTOCOL,
  isEmbedFrame as isCheckoutFrame,
  type CheckoutEmbedCallbacks,
  type CheckoutEmbedHandle,
  type CheckoutMode,
  type CheckoutState,
  type CompletePayload,
  type CreateCheckoutEmbedOptions,
  type EmbedErrorCode,
  type EmbedSource,
  type PaymentMethod,
  type ThemeOptions,
} from "@beinfi/checkout";
export {
  createPortalClient,
  PortalError,
  type CardSetup,
  type PortalCard,
  type PortalClient,
  type PortalClientOptions,
  type PortalDownload,
  type PortalOrder,
  type PortalRefundRequest,
  type PortalScope,
  type PortalSession,
  type PortalSubscription,
} from "./portal.js";
export {
  PORTAL_PROTOCOL,
  createPortalEmbed,
  isPortalFrame,
  portalEmbedUrl,
  type ParentToPortal,
  type PortalEmbedHandle,
  type PortalEmbedOptions,
  type PortalMode,
  type PortalToParent,
} from "./embed.js";
export { apiBaseFor, getStorefront, type PublicStorefront, type StorefrontItem } from "./storefront.js";
