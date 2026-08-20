import type { components } from "./generated/openapi.js";


/** Backend schema aliases — single source of truth via OpenAPI codegen. */
export type UsageEvent = components["schemas"]["UsageEvent"];
export type IngestResult = components["schemas"]["IngestResult"];

// ── Catalog / billing surface ──────────────────────────────────────────────
export type Product = components["schemas"]["Product"];
export type CreateProductRequest = components["schemas"]["CreateProductRequest"];
export type Version = components["schemas"]["Version"];
export type Price = components["schemas"]["Price"];
export type PriceInput = components["schemas"]["PriceInput"];
export type Meter = components["schemas"]["Meter"];
export type CreateMeterRequest = components["schemas"]["CreateMeterRequest"];
export type UpdateMeterRequest = components["schemas"]["UpdateMeterRequest"];
export type RateCard = components["schemas"]["RateCard"];
export type CreditSummary = components["schemas"]["CreditSummary"];
export type UsageReport = components["schemas"]["UsageReport"];

/**
 * Aggregated single-read customer view (`GET /customers/{id}/state`): the
 * enrollment, its credit wallet, live subscriptions, and current-period usage.
 */
export type CustomerState = components["schemas"]["CustomerState"];
export type Coupon = components["schemas"]["Coupon"];
export type PaymentLink = components["schemas"]["PaymentLink"];
export type CreateCouponRequest = components["schemas"]["CreateCouponRequest"];
export type Invoice = components["schemas"]["Invoice"];
export type CreateInvoiceRequest = components["schemas"]["CreateInvoiceRequest"];
export type CreateProductInvoiceRequest = components["schemas"]["CreateProductInvoiceRequest"];
export type CheckoutSession = components["schemas"]["CheckoutSession"];
export type Payment = components["schemas"]["Payment"];
export type Refund = components["schemas"]["Refund"];
export type Customer = components["schemas"]["Customer"];
export type CreateCustomerRequest = components["schemas"]["CreateCustomerRequest"];
export type ProductCustomer = components["schemas"]["ProductCustomer"];
export type Subscription = components["schemas"]["Subscription"];
export type SubscriptionPeriod = components["schemas"]["SubscriptionPeriod"];
export type Deliverable = components["schemas"]["Deliverable"];
export type PresignDeliverableRequest = components["schemas"]["PresignDeliverableRequest"];
export type PresignDeliverableResponse = components["schemas"]["PresignDeliverableResponse"];
export type PutDeliverableRequest = components["schemas"]["PutDeliverableRequest"];
export type Tenant = components["schemas"]["Tenant"];
export type ApiKey = components["schemas"]["ApiKey"];
export type CreatedApiKey = components["schemas"]["CreatedApiKey"];
export type CLITokenResponse = components["schemas"]["CLITokenResponse"];
export type WebhookEndpoint = components["schemas"]["WebhookEndpoint"];
export type WebhookDelivery = components["schemas"]["WebhookDelivery"];

// Inline request bodies (no named schema in the OpenAPI spec).
export type VersionGrant = components["schemas"]["VersionGrant"];

export interface VersionInput {
  billingCycle?: "weekly" | "monthly" | "annual" | null;
  basePrice?: string | null;
  /** Per-meter allowances the version grants (cycle renewal / on payment). */
  grants?: VersionGrant[];
  /**
   * @deprecated The backend dropped `credits_per_cycle` (migration 000098) and now
   * rejects the field with a 422. Use `grants: [{ meter, amount, on: "cycle" }]`.
   */
  creditsPerCycle?: string | null;
}
export interface GrantCreditInput {
  /** Decimal string amount to grant. */
  amount: string;
  reference?: string | null;
}
export type PaymentMethod = "pix" | "boleto" | "card";

/** Test vs live. Picks which API host the SDK talks to. */
export type InfiMode = "sandbox" | "live";

export interface InfiConfig {
  /** Secret API key (`sk_live_...` / `sk_test_...`) for server-side calls. */
  secretKey?: string;
  /**
   * `"sandbox"` (default) or `"live"`. When omitted it is inferred from the key
   * prefix (`sk_live_` → live, else sandbox). The SDK resolves the API host from
   * this — you never pass a base URL for prod.
   */
  mode?: InfiMode;
  /** Override the API host (local dev / self-host / tests). Defaults per mode. */
  apiUrl?: string;
  /**
   * Override the host serving hosted checkout and payment links. Defaults per
   * mode (live → app.beinfi.com, sandbox → app-sandbox.beinfi.com).
   */
  appUrl?: string;
}

export interface CustomerSummary {
  id: string;
  externalId?: string;
  email?: string | null;
}

// Sandbox and live are separate deployments with separate hosts, for the app as
// much as the API — a sandbox tenant does not exist on the live app, so a link
// built on the wrong host 404s. The SDK picks both from `mode`.
export const SANDBOX_API_BASE = "https://api-sandbox.beinfi.com";
export const LIVE_API_BASE = "https://api.beinfi.com";
export const SANDBOX_APP_BASE = "https://app-sandbox.beinfi.com";
export const LIVE_APP_BASE = "https://app.beinfi.com";
/** @deprecated The app host is mode-aware — use {@link resolveAppBase}. Alias of {@link LIVE_APP_BASE}. */
export const DEFAULT_APP_BASE = LIVE_APP_BASE;
export const SESSION_COOKIE_NAME = "infi_session";

/** Infer the mode from a key prefix: `sk_live_` → live, anything else → sandbox. */
export function modeFromKey(secretKey?: string): InfiMode {
  return secretKey?.startsWith("sk_live_") ? "live" : "sandbox";
}

/** Resolve the API host from mode, honoring an explicit override (local/tests). */
export function resolveApiBase(mode: InfiMode, override?: string): string {
  if (override) return override.replace(/\/$/, "");
  return mode === "live" ? LIVE_API_BASE : SANDBOX_API_BASE;
}

/**
 * Resolve the app host (hosted checkout, payment links) from mode, honoring an
 * explicit override (local/tests). Mirrors {@link resolveApiBase}.
 */
export function resolveAppBase(mode: InfiMode, override?: string): string {
  if (override) return override.replace(/\/$/, "");
  return mode === "live" ? LIVE_APP_BASE : SANDBOX_APP_BASE;
}
