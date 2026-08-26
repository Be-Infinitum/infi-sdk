import type { Transport } from "../http.js";
import type { PaymentPayload, PaymentRequirements, VerifiedBy } from "../rail/types.js";

/**
 * Per-meter price for a rail route, denominated in the ASSET (USD for USDC),
 * not in the tenant's invoicing currency. The rail is a USD rail; ADR 0049 puts
 * the merchant's FX on the merchant.
 */
export interface RailMeterPrice {
  /** Price of ONE unit of the meter, as a decimal string (e.g. `"0.005"`). */
  unitAmount: string;
  /** Human sentence for `accepts[].description` (e.g. "Web search, one query"). */
  description?: string;
}

/**
 * What the middleware needs to build a 402 without guessing.
 *
 * `assetDecimals` is the reason this call exists: it is read from the token
 * contract, and hardcoding 6 works until the first non-USDC asset and then
 * quietly overcharges by a thousand (§4.4).
 */
export interface RailConfigResponse {
  network: string;
  /** Contract address on EVM, mint on SVM. Never a ticker. */
  asset: string;
  assetDecimals: number;
  /** The tenant's configured wallet, from `rail_settings`. */
  payTo?: string;
  maxTimeoutSeconds?: number;
  /** EIP-712 domain for the asset (`{ name, version }`). Signing needs it. */
  extra?: Record<string, unknown>;
  /** Prices, keyed by meter. */
  meters?: Record<string, RailMeterPrice>;
  /** Tenant grace policy (`rail_settings.grace_*`), per process. */
  grace?: { window?: string; maxPerAgent?: string };
  /**
   * The connected facilitator. `indexesForDiscovery: false` means the merchant
   * is invisible to the Bazaar however the route declares itself (§9.1.2).
   */
  facilitator?: { provider?: string; indexesForDiscovery?: boolean };
}

/** The body of `POST /rail/verify` — §5's `{ paymentPayload, paymentRequirements }`, plus what only we meter. */
export interface RailVerifyRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  /** The `X-PAYMENT` header verbatim. Settlement replays this, never a rebuild. */
  payment: string;
  /** Product key the route sells. */
  product: string;
  /** Meter the request bills against. */
  meter: string;
  /** Ceiling quantity for this request (1 unless the route set `max`). */
  quantity?: string;
  /**
   * `"grace"` when this is a queued payload being replayed after an outage. A
   * replay that loses the claim was a duplicate and is dropped (§6).
   */
  verifiedBy?: VerifiedBy;
}

export interface RailVerifyResponse {
  isValid: boolean;
  /** Closed enumeration: `insufficient_funds`, `payment_expired`, … (§2.4). */
  invalidReason?: string;
  /** The recovered address. Present even on a refusal — the failure path knows who tried. */
  payer?: string;
  agent?: { id?: string; enrollmentId?: string; address?: string; network?: string };
  /** Allowance Infi issues for the next outage (§6). */
  grace?: { maxPerAgent?: string; window?: string };
}

/** Reporting the real quantity for a variable-price route (§5.1). */
export interface RailSettleRequest {
  network: string;
  payer: string;
  nonce: string;
  /** The quantity actually consumed. The authorization stays at the ceiling. */
  quantity: string;
  meter?: string;
}

export interface RailSettleResponse {
  status?: string;
}

/**
 * Infi Rail — the seller-side calls the `@beinfi/sdk/rail` middleware makes.
 *
 * This client never holds a wallet, never signs and never sees a private key.
 * The payer signs; the merchant is named as recipient in what they signed; Infi
 * verifies and accounts. There is no field in which Infi could name itself.
 */
export class RailResource {
  constructor(private readonly t: Transport) {}

  /** Wallet, network, asset + decimals, prices and grace policy for a product. */
  config(product: string, opts: { timeoutMs?: number } = {}): Promise<RailConfigResponse> {
    return this.t.request("GET", "/rail/config", {
      query: { product },
      requireSecret: true,
      timeoutMs: opts.timeoutMs,
    });
  }

  /**
   * Verify one authorization and claim the right to serve it.
   *
   * Infi does the accounting — decode, resolve the agent, claim the nonce, check
   * exposure, write the meter — and delegates the cryptography to the merchant's
   * facilitator (§3.2). A `timeoutMs` is not optional in practice: it is what
   * turns an Infi outage into grace instead of a hung request.
   */
  verify(body: RailVerifyRequest, opts: { timeoutMs?: number } = {}): Promise<RailVerifyResponse> {
    return this.t.request("POST", "/rail/verify", {
      body,
      requireSecret: true,
      timeoutMs: opts.timeoutMs,
      // The nonce is the idempotency key the backend already enforces
      // (UNIQUE (network, payer, nonce)); a retry must not claim twice.
      idempotencyKey: idempotencyForPayload(body),
    });
  }

  /** Report the real quantity consumed by a variable-price route. */
  settle(body: RailSettleRequest, opts: { timeoutMs?: number } = {}): Promise<RailSettleResponse> {
    return this.t.request("POST", "/rail/settle", {
      body,
      requireSecret: true,
      timeoutMs: opts.timeoutMs,
      idempotencyKey: `rail:${body.network}:${body.payer}:${body.nonce}:settle`,
    });
  }
}

/** `rail:{network}:{payer}:{nonce}` — the same key the claim and the meter use. */
function idempotencyForPayload(body: RailVerifyRequest): string | undefined {
  const auth = body.paymentPayload.payload.authorization;
  if (!auth) return undefined;
  return `rail:${body.paymentPayload.network}:${auth.from}:${auth.nonce}`;
}
