/**
 * Where the embed is served from.
 *
 * Deliberately duplicated from `@beinfi/sdk` rather than imported. The SDK's
 * root entry imports `node:crypto` (for `verifyWebhook`), and a browser package
 * must not drag that into a merchant's bundle graph — nor carry a first-party
 * version range it would have to track forever. The cost is these ten lines.
 */

export type CheckoutMode = "sandbox" | "live";

export const SANDBOX_APP_BASE = "https://app-sandbox.beinfi.com";
export const LIVE_APP_BASE = "https://app.beinfi.com";

/** Resolve the host serving the embed, honoring an explicit override for local
 *  development against the frontend on :4003. */
export function resolveAppBase(mode: CheckoutMode, override?: string): string {
  if (override) return override.replace(/\/$/, "");
  return mode === "live" ? LIVE_APP_BASE : SANDBOX_APP_BASE;
}

/**
 * Path prefix selecting which API the checkout talks to, mirroring the hosted
 * checkout's own `checkoutPathPrefix`. The host picks the deployment; this
 * picks the environment, and they are not the same choice.
 */
export function embedPathPrefix(mode: CheckoutMode): string {
  return mode === "sandbox" ? "/embed/sandbox" : "/embed";
}
