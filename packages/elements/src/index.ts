/**
 * @beinfi/elements — Infi elements, headless (the Whop Elements model: a core
 * here, React components in @beinfi/elements-react).
 *
 * The checkout embed lives here; @beinfi/checkout is the legacy entry point and
 * re-exports it.
 */
export {
  createCheckoutEmbed,
  type CheckoutEmbedCallbacks,
  type CheckoutEmbedHandle,
  type CreateCheckoutEmbedOptions,
} from "./checkout/core.js";
export {
  buildEmbedUrl,
  parseCheckoutHref,
  InvalidEmbedUrlError,
  type EmbedSource,
  type EmbedUrlOptions,
  type ThemeOptions,
} from "./checkout/url.js";
export {
  embedPathPrefix,
  resolveAppBase,
  LIVE_APP_BASE,
  SANDBOX_APP_BASE,
  type CheckoutMode,
} from "./checkout/hosts.js";
export {
  PROTOCOL as CHECKOUT_PROTOCOL,
  isEmbedFrame as isCheckoutFrame,
  type CheckoutState,
  type CompletePayload,
  type EmbedErrorCode,
  type EmbedRequestMethod,
  type EmbedToParent,
  type Envelope,
  type ParentToEmbed,
  type PaymentMethod,
} from "./checkout/protocol.js";
export {
  createPortalClient,
  PortalError,
  type CardSetup,
  type PortalCard,
  type PortalClient,
  type PortalClientOptions,
  type PortalCommunity,
  type PortalCourse,
  type PortalKeyAccess,
  type PortalLesson,
  type LessonState,
  type VideoProvider,
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
export {
  apiBaseFor,
  getStorefront,
  type ProductFaq,
  type ProductMedia,
  type ProductPageFields,
  type PublicPaymentLink,
  type PublicStorefront,
  type StorefrontItem,
} from "./storefront.js";
export {
  APPEARANCE_FONTS,
  APPEARANCE_RADII,
  DEFAULT_APPEARANCE,
  FONT_STACKS,
  RADIUS_LENGTHS,
  appearanceCssVars,
  effectiveAppearance,
  readableOn,
  resolveAppearance,
  type Appearance,
  type AppearanceFont,
  type AppearanceLevels,
  type AppearanceRadius,
  type AppearanceSource,
  type ResolvedAppearance,
} from "./appearance.js";
export {
  EXAMPLE_BUYER,
  EXAMPLE_PURCHASE_DAYS_AGO,
  PREVIEW_PIX_CODE,
  exampleCourse,
  exampleMemberView,
  previewProductFromDraft,
  previewQrMatrix,
  previewStorefront,
  previewStorefrontItem,
  type BillingCycle,
  type CourseDraft,
  type ElementPreview,
  type ExampleBuyer,
  type ExampleMemberView,
  type PreviewProduct,
  type ProductDraft,
} from "./preview.js";
export {
  createCompletionTracker,
  detectVideoProvider,
  DEFAULT_COMPLETION_THRESHOLD,
  type CompletionTracker,
  type CompletionTrackerOptions,
} from "./lesson.js";
export {
  FALLBACK_LOCALE,
  MESSAGES,
  SUPPORTED_LOCALES,
  detectLocale,
  matchLocale,
  messagesFor,
  resolveLocale,
  type ElementMessages,
  type InfiLocale,
} from "./locale.js";
export { detectColorScheme, type ColorScheme } from "./theme.js";
export {
  createSignals,
  type FeedbackInput,
  type SignalEvent,
  type SignalKind,
  type SignalsClient,
  type SignalsOptions,
} from "./signals.js";
