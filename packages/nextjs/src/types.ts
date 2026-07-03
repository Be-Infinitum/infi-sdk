import type { AuthResult, InsufficientCreditError, SessionMode } from "@beinfi/sdk";
import type { NextRequest, NextResponse } from "next/server";

/** Forwarded to `setSessionCookie` from `@beinfi/sdk`. */
export interface CookieOptions {
  /** Cookie max-age in seconds. Defaults to 7 days. */
  maxAgeSeconds?: number;
  /** Force the Secure flag (default: true in production). */
  secure?: boolean;
  /** Cookie path. Default: / */
  path?: string;
}

export interface LoginOptions {
  /** App slug the hosted login is scoped to. */
  slug: string;
  /** Where the hosted flow lands after the code is verified. Relative paths are resolved against the request origin. */
  redirectTo: string;
  /** Hosted login base URL. Defaults to the SDK's `DEFAULT_AUTH_BASE`. */
  authBaseUrl?: string;
  /** Opaque value echoed back on the redirect. A function receives the incoming request. */
  state?: string | ((req: NextRequest) => string | undefined);
}

export interface CallbackOptions {
  /** Secret key (`sk_...`) used to exchange the auth code server-side. */
  secretKey: string;
  /** Where to send the browser after a successful exchange. Relative paths are resolved against the request origin. */
  successUrl: string;
  /** Infi API base URL. Defaults to the SDK's `DEFAULT_API_BASE`. */
  baseUrl?: string;
  /** Session mode passed to `exchangeCode` ("infi" | "byo"). */
  sessionMode?: SessionMode;
  /** Cookie options forwarded to `setSessionCookie`. */
  cookie?: CookieOptions;
  /**
   * Runs after a successful exchange, before the default redirect. Return a
   * `NextResponse` to take over the response entirely (e.g. persist a BYO session).
   */
  onAuth?: (
    result: AuthResult,
    req: NextRequest,
  ) => void | NextResponse | Promise<void | NextResponse>;
  /**
   * Where to send the browser after a FAILED exchange (e.g. your login page).
   * Relative paths resolve against the request origin. The failure is appended as
   * `?error=<code>&message=<msg>` so the page can show it. Ignored when `onError`
   * is set. Without either, a failed exchange returns a JSON error.
   */
  errorUrl?: string;
  /** Handle a failed exchange. Defaults to `errorUrl` redirect, else a JSON error response. */
  onError?: (error: unknown, req: NextRequest) => NextResponse;
}

export interface UsageOptions {
  /** Secret key (`sk_...`) used to ingest events server-side. */
  secretKey: string;
  /** Infi API base URL. Defaults to the SDK's `DEFAULT_API_BASE`. */
  baseUrl?: string;
  /** Resolve the authed customer's id and stamp it onto every event in the request. */
  resolveCustomerId?: (req: NextRequest) => string | undefined | Promise<string | undefined>;
}

export interface MeterRouteOptions {
  /** Secret key (`sk_...`) used to gate credit + record usage server-side. */
  secretKey: string;
  /** Infi API base URL. Defaults to the SDK's `DEFAULT_API_BASE`. */
  baseUrl?: string;
  /** Meter the usage records against (e.g. "tokens"). */
  meter: string;
  /** Resolve the authed customer's id from the request (required — who is charged). */
  resolveCustomerId: (req: NextRequest) => string | undefined | Promise<string | undefined>;
  /** Explicit usage value; skips token auto-detection from the handler result. */
  value?: number | string;
  /** Custom usage extractor from the handler result (overrides built-in detection). */
  extract?: (result: unknown) => number | string;
  /** Record usage without the pre-flight credit gate (default false). */
  skipGuard?: boolean;
  /** Extra metadata stamped onto the usage event. */
  metadata?: Record<string, unknown>;
  /** Response when `resolveCustomerId` yields nothing. Default: 400 JSON. */
  onMissingCustomer?: (req: NextRequest) => NextResponse;
  /** Response when the customer is out of credit. Default: 402 JSON. */
  onInsufficientCredit?: (error: InsufficientCreditError, req: NextRequest) => NextResponse;
}
