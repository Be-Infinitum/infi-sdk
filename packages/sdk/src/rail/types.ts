/**
 * The x402 wire, as measured — not as the published specification describes it.
 *
 * The spec describes v2 (`amount`, a `resource` object, `PAYMENT-SIGNATURE`).
 * Every shipping library hardcodes `x402Version: 1` and uses `X-PAYMENT` /
 * `X-PAYMENT-RESPONSE`, so that is what interoperates with agents today. The
 * version lives in ONE constant: v2 arrives as a branch, never as a rename.
 *
 * Rail design §2. Mirrors `internal/rail/rail.go` field for field.
 */

/** Protocol version on the wire. One constant, deliberately (§2.1). */
export const X402_VERSION = 1;

/** Request header carrying the payer's signed authorization (base64 JSON). */
export const PAYMENT_HEADER = "X-PAYMENT";

/** Response header carrying the settlement receipt (base64 JSON). */
export const PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";

/** Only `exact` ships. `upto` is experimental and not built here. */
export type RailScheme = "exact";

/** Networks the rail settles on. EVM and SVM payload shapes differ. */
export type RailNetwork = "base" | "base-sepolia" | "solana" | "solana-devnet";

/**
 * One entry of the 402 body's `accepts` array.
 *
 * RISK ZONE (money). `maxAmountRequired` is ATOMIC units as a string — `"5000"`
 * is 0.005 USDC at six decimals. `asset` is a contract address or mint, never a
 * ticker. `extra` carries the EIP-712 domain; omit it and no client can sign.
 */
export interface PaymentRequirements {
  scheme: RailScheme;
  network: string;
  /** Atomic units, as a decimal string. Never a human amount. */
  maxAmountRequired: string;
  /** Flat URL string. `description` and `mimeType` are siblings, not nested. */
  resource: string;
  description: string;
  mimeType: string;
  /** The merchant's address. There is no field in which Infi could name itself. */
  payTo: string;
  maxTimeoutSeconds: number;
  /** ERC-20 contract address on EVM, mint on SVM. Differs per network. */
  asset: string;
  /**
   * Discovery intent rides here on v1: `{ input: { type, method, discoverable } }`.
   * The docs describe an `extensions` object instead — build what ships (§9.1.3).
   */
  outputSchema?: Record<string, unknown>;
  /** EIP-712 domain, e.g. `{ name: "USDC", version: "2" }`. Pass-through, always. */
  extra?: Record<string, unknown>;
}

/** The 402 body. */
export interface PaymentRequiredBody {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
}

/** EIP-3009 `transferWithAuthorization` argument set, as it arrives on EVM. */
export interface ExactEvmAuthorization {
  from: string;
  to: string;
  /** Atomic units, as a string. */
  value: string;
  /** Unix seconds, as a string. */
  validAfter: string;
  /** Unix seconds, as a string. */
  validBefore: string;
  /** 32 random bytes, client-generated. The server never issues one. */
  nonce: string;
}

/**
 * The decoded `X-PAYMENT` header. `payload` is scheme- and network-specific, so
 * it stays loose: SVM has a different shape and we only record and forward it.
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: RailScheme;
  network: string;
  payload: {
    signature?: string;
    authorization?: ExactEvmAuthorization;
    [key: string]: unknown;
  };
}

/**
 * The `X-PAYMENT-RESPONSE` body (base64 JSON on the wire).
 *
 * `transaction` is empty here and that is not a bug: Infi settles in batches
 * (§7), so no hash exists at response time. The agent got what it paid for; the
 * chain hop happens after.
 */
export interface PaymentResponseBody {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
}

/** Who vouched for an authorization. `grace` is a materially weaker claim (§6). */
export type VerifiedBy = "infi" | "grace";

/** The payer, identified by its wallet address. */
export interface RailAgent {
  /** Wallet address: lower-cased hex on EVM, base58 on Solana. */
  address: string;
  network: string;
  /** Infi's agent id, when `/verify` answered. Absent under grace. */
  id?: string;
  /** The enrollment this agent resolves to. Absent under grace. */
  enrollmentId?: string;
}

/** One claimed right to serve one request, as the handler sees it. */
export interface RailAuthorization {
  scheme: RailScheme;
  network: string;
  payer: string;
  /** The merchant's wallet. Always. */
  payTo: string;
  asset: string;
  /** What the payer signed, in atomic units. */
  valueAtomic: string;
  /**
   * The same amount at the invoice's scale, converted exactly once
   * (`decimalFromAtomic`). USDC at 6 decimals: `"5000"` -> `"0.005"`.
   */
  valueDecimal: string;
  /** Unix seconds. */
  validAfter: number;
  /** Unix seconds. */
  validBefore: number;
  nonce: string;
  resource: string;
  meter: string;
  /**
   * The `X-PAYMENT` header verbatim. Settlement replays this; a rebuilt payload
   * is a different payload.
   */
  raw: string;
}

/** Result of reporting the real quantity for a variable-price route. */
export interface RailSettleResult {
  /** `true` once Infi has the real quantity; `false` when it was queued. */
  accepted: boolean;
  /** `"queued"` while Infi is unreachable — replayed when it returns. */
  status: "recorded" | "queued";
}

/**
 * What `req.infi` carries inside a paid handler.
 *
 * `verifiedBy` is exposed on purpose: a merchant who cares can log when it was
 * serving on grace, which is an unverified authorization (§6).
 */
export interface InfiPaymentContext {
  agent: RailAgent;
  authorization: RailAuthorization;
  verifiedBy: VerifiedBy;
  /**
   * True up a variable-price route with the real quantity. The authorization
   * stays at the ceiling — it is what the payer signed and cannot be edited
   * after the fact; the difference is credited to the agent (§5.1).
   */
  settle(input: { quantity: number | string }): Promise<RailSettleResult>;
}
