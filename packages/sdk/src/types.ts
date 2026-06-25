export type SessionMode = "infi" | "byo";

export type MagicLinkMode = "embedded" | "hosted";

export interface InfiConfig {
  /** Secret API key (`sk_live_...` / `sk_test_...`) for server-side calls. */
  secretKey?: string;
  /** Publishable key (`pk_live_...`) for browser-safe sendMagicLink. */
  publishableKey?: string;
  /** Beinfi API base URL. Default: https://api.beinfi.com */
  baseUrl?: string;
  /** Hosted login base URL. Default: https://auth.beinfi.com */
  authBaseUrl?: string;
}

export interface SendMagicLinkOptions {
  email: string;
  redirectTo?: string;
  mode?: MagicLinkMode;
  state?: string;
}

export interface ValidateMagicLinkOptions {
  sessionMode?: SessionMode;
}

export interface ExchangeCodeOptions {
  sessionMode?: SessionMode;
}

export interface AppUser {
  id: string;
  appId: string;
  email: string;
  verifiedAt?: string | null;
  createdAt: string;
}

export interface CustomerSummary {
  id: string;
  externalId?: string;
  userId?: string | null;
  email?: string | null;
}

export interface SessionPayload {
  token: string;
  expiresAt: string;
}

export interface AuthResult {
  user: AppUser;
  customer?: CustomerSummary | null;
  session?: SessionPayload | null;
}

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
