import type { components } from "./generated/openapi.js";

export type SessionMode = "infi" | "byo";

/** Backend schema aliases — single source of truth via OpenAPI codegen. */
export type EmailCodeRequest = components["schemas"]["EmailCodeRequest"];
export type VerifyCodeRequest = components["schemas"]["VerifyCodeRequest"];
export type HostedAppConfig = components["schemas"]["HostedAppConfig"];
export type ExchangeRequest = components["schemas"]["ExchangeRequest"];
export type AuthResult = components["schemas"]["AuthResult"];
export type AppIdentity = components["schemas"]["AppIdentity"];
export type UsageEvent = components["schemas"]["UsageEvent"];
export type IngestResult = components["schemas"]["IngestResult"];

export interface InfiConfig {
  /** Secret API key (`sk_live_...` / `sk_test_...`) for server-side calls. */
  secretKey?: string;
  /** Beinfi API base URL. Default: https://api.beinfi.com */
  baseUrl?: string;
  /** Hosted login base URL. Default: https://auth.beinfi.com */
  authBaseUrl?: string;
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
  authBaseUrl?: string;
}

export const DEFAULT_API_BASE = "https://api.beinfi.com";
export const DEFAULT_AUTH_BASE = "https://auth.beinfi.com";
export const SESSION_COOKIE_NAME = "infi_session";
