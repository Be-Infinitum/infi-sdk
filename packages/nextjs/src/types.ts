import type { InsufficientCreditError } from "@beinfi/sdk";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Gate/record behavior by billing intent (mirrors the SDK's `MeterOptions.mode`,
 * which isn't re-exported from `@beinfi/sdk`). `"prepaid"` gates then records,
 * `"postpaid"` records only, `"streaming"` gates only.
 */
export type MeterMode = "prepaid" | "postpaid" | "streaming";

export interface UsageOptions {
  /** Secret key (`sk_...`) used to ingest events server-side. */
  secretKey: string;
  /** Infi API base URL. Defaults to the mode-derived host. */
  apiUrl?: string;
  /** Resolve the authed customer's id and stamp it onto every event in the request. */
  resolveCustomerId?: (req: NextRequest) => string | undefined | Promise<string | undefined>;
}

export interface MeterRouteOptions {
  /** Secret key (`sk_...`) used to gate credit + record usage server-side. */
  secretKey: string;
  /** Infi API base URL. Defaults to the mode-derived host. */
  apiUrl?: string;
  /** Meter the usage records against (e.g. "tokens"). */
  meter: string;
  /** Gate/record behavior by billing intent. Default `"prepaid"` (gate + record). */
  mode?: MeterMode;
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

export interface MeterActionOptions {
  /** Secret key (`sk_...`) used to gate credit + record usage server-side. */
  secretKey: string;
  /** Infi API base URL. Defaults to the mode-derived host. */
  apiUrl?: string;
  /** Meter the usage records against (e.g. "tokens"). */
  meter: string;
  /**
   * The customer charged for the usage. Server Actions have no `NextRequest`, so
   * the caller resolves this from the session before invoking the action.
   */
  customerId: string;
  /** Gate/record behavior by billing intent. Default `"prepaid"` (gate + record). */
  mode?: MeterMode;
  /** Explicit usage value; skips token auto-detection from the action result. */
  value?: number | string;
  /** Custom usage extractor from the action result (overrides built-in detection). */
  extract?: (result: unknown) => number | string;
  /** Extra metadata stamped onto the usage event. */
  metadata?: Record<string, unknown>;
}

export interface GuardCreditOptions {
  /** Secret key (`sk_...`) used to read the customer's wallet balance. */
  secretKey: string;
  /** Infi API base URL. Defaults to the mode-derived host. */
  apiUrl?: string;
  /** The customer whose credit is gated. */
  customerId: string;
}

export interface StateOptions {
  /** Secret key (`sk_...`) used to read customer state server-side. */
  secretKey: string;
  /** Infi API base URL. Defaults to the mode-derived host. */
  apiUrl?: string;
  /** Resolve the authed customer's id from the request (required — whose state). */
  resolveCustomerId: (req: NextRequest) => string | undefined | Promise<string | undefined>;
}
