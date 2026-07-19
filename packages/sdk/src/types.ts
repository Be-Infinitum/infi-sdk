import type { components } from "./generated/openapi.js";

export type SessionMode = "infi" | "byo";

/** Backend schema aliases — single source of truth via OpenAPI codegen. */
export type EmailCodeRequest = components["schemas"]["EmailCodeRequest"];
export type VerifyCodeRequest = components["schemas"]["VerifyCodeRequest"];
export type HostedAppConfig = components["schemas"]["HostedAppConfig"];
export type ExchangeRequest = components["schemas"]["ExchangeRequest"];
export type AuthResult = components["schemas"]["AuthResult"];
export type AppIdentity = components["schemas"]["AppIdentity"];
export type App = components["schemas"]["App"];
export type CreateAppRequest = components["schemas"]["CreateAppRequest"];
export type UpdateAppRequest = components["schemas"]["UpdateAppRequest"];
export type UsageEvent = components["schemas"]["UsageEvent"];
export type IngestResult = components["schemas"]["IngestResult"];
export type SessionIntrospection = components["schemas"]["SessionIntrospection"];

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
export type CreateCouponRequest = components["schemas"]["CreateCouponRequest"];
export type Invoice = components["schemas"]["Invoice"];
export type CreateInvoiceRequest = components["schemas"]["CreateInvoiceRequest"];
export type CreateProductInvoiceRequest = components["schemas"]["CreateProductInvoiceRequest"];
export type CheckoutSession = components["schemas"]["CheckoutSession"];
export type Payment = components["schemas"]["Payment"];
export type Customer = components["schemas"]["Customer"];
export type CreateCustomerRequest = components["schemas"]["CreateCustomerRequest"];
export type ProductCustomer = components["schemas"]["ProductCustomer"];
export type Subscription = components["schemas"]["Subscription"];
export type SubscriptionPeriod = components["schemas"]["SubscriptionPeriod"];
export type Deliverable = components["schemas"]["Deliverable"];
export type PresignDeliverableRequest = components["schemas"]["PresignDeliverableRequest"];
export type PresignDeliverableResponse = components["schemas"]["PresignDeliverableResponse"];
export type PutDeliverableRequest = components["schemas"]["PutDeliverableRequest"];
export type ApiKey = components["schemas"]["ApiKey"];
export type CreatedApiKey = components["schemas"]["CreatedApiKey"];
export type CLITokenResponse = components["schemas"]["CLITokenResponse"];
export type WebhookEndpoint = components["schemas"]["WebhookEndpoint"];
export type WebhookDelivery = components["schemas"]["WebhookDelivery"];

// Inline request bodies (no named schema in the OpenAPI spec).
export interface VersionInput {
  billingCycle?: "weekly" | "monthly" | "annual" | null;
  basePrice?: string | null;
  /** Prepaid credit allowance granted each cycle (decimal string). Prepaid only. */
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
  /** Override the app host that serves hosted checkout/login. Default app.beinfi.com. */
  appUrl?: string;
}

export interface SendEmailCodeOptions {
  /** App slug the login is scoped to. */
  slug: string;
  email: string;
  /** Where to land after the auth code is verified (must be in the app allowlist). */
  redirectTo?: string;
  /** Opaque value echoed back on the redirect URL. */
  state?: string;
}

export interface VerifyEmailCodeOptions {
  /** App slug the login is scoped to. */
  slug: string;
  email: string;
  /** The 6-digit code from the email. */
  code: string;
}

export interface ExchangeCodeOptions {
  sessionMode?: SessionMode;
}

export interface CustomerSummary {
  id: string;
  externalId?: string;
  identityId?: string | null;
  email?: string | null;
}

/** Session payload as returned by the backend (`AuthResult.session`). */
export type SessionPayload = NonNullable<AuthResult["session"]>;

/** Minimal request shape for framework adapters (Next.js, Express, etc.). */
export interface InfiRequestLike {
  url: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  json?: () => Promise<unknown>;
}

/** Minimal response shape for cookie helpers. */
export interface InfiResponseLike {
  headers: {
    append(name: string, value: string): void;
  };
}

export interface StartHostedLoginOptions {
  slug: string;
  redirectTo: string;
  state?: string;
  /**
   * Host that serves the hosted-login page (`/identity/{slug}/login`) — the
   * frontend app. Defaults to {@link DEFAULT_APP_BASE}. Point it at your local
   * frontend in dev (e.g. `http://localhost:3000`).
   */
  appUrl?: string;
}

// API hosts, picked by mode. Sandbox and live are separate deployments (ADR 0014);
// the SDK selects the host from `mode` so callers never hand-pass a base.
export const SANDBOX_API_BASE = "https://api-sandbox.beinfi.com";
export const LIVE_API_BASE = "https://api.beinfi.com";
// The frontend app renders the hosted-login page (`/identity/{slug}/login`) and
// hosted checkout (`/pay/...`) for both modes — same host.
export const DEFAULT_APP_BASE = "https://app.beinfi.com";
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
