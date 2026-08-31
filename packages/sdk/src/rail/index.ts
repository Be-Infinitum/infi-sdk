/**
 * `@beinfi/sdk/rail` — sell one HTTP request to an agent that never signed up.
 *
 * ```ts
 * import { Infi } from "@beinfi/sdk";
 * import { requirePayment } from "@beinfi/sdk/rail";
 *
 * const infi = new Infi(process.env.INFI_SECRET_KEY!);
 * const pay = await requirePayment(infi, {
 *   product: "serp-api",
 *   wallet: "0xMerchantWallet",
 *   grace: { window: "5m", maxPerAgent: "0.50" },   // per process, not global
 * });
 *
 * app.get("/v1/search", pay({ meter: "searches" }), handler);
 * app.post("/v1/summarize", pay({ meter: "tokens", max: 8000 }), handler);
 * ```
 *
 * The same rail sells MCP tools over Streamable HTTP — `requireMcpPayment`, one
 * gate in front of the transport. No backend change: an MCP tool call is an HTTP
 * POST, which is the envelope a 402 already fits into.
 *
 * **Seller side only.** This module never holds a wallet, never signs and never
 * sees a private key. The agent signs an authorization naming YOUR wallet as
 * recipient — non-custody is a property of what it signed, not a promise anyone
 * makes. Infi verifies and meters; the money goes from the agent to you.
 *
 * **Grace is per process** (§6). `maxPerAgent` bounds one agent on one instance,
 * so real exposure during an Infi outage is `maxPerAgent x instances`. Set
 * `grace.maxTotal` for a bound that also survives a forged payer address, and
 * `grace: false` to refuse rather than ever serve unverified.
 */

export { requirePayment, paid } from "./express.js";
export type {
  PayFactory,
  PaymentMiddleware,
  PaidRequest,
  ExpressRequestLike,
  ExpressResponseLike,
  ExpressNext,
} from "./express.js";

export { createRail, Rail, RailRoute, isUnreachable } from "./core.js";
export type {
  PayOptions,
  RailClient,
  RailDecision,
  RailEvent,
  RailRequestLike,
  RailSettingsInput,
  RequirePaymentOptions,
} from "./core.js";

export { requireMcpPayment } from "./mcp.js";
export type { McpGate, McpPaymentOptions, McpRequestLike, McpResponseLike } from "./mcp.js";

export { GraceLedger, parseDuration, resolveGrace } from "./grace.js";
export type { GraceOptions, GraceRefusal, GraceSpend, QueuedPayment, ResolvedGrace } from "./grace.js";

export { buildRequirements, paymentRequiredBody } from "./requirements.js";
export type { ResolvedRailSettings, ResolvedRoute } from "./requirements.js";

export {
  decodePaymentHeader,
  decodePaymentResponse,
  encodePaymentHeader,
  encodePaymentResponse,
  evmAuthorization,
  MalformedPaymentError,
} from "./header.js";

export {
  atomicForQuantity,
  atomicFromDecimal,
  compareAtomic,
  compareDecimal,
  decimalFromAtomic,
  normalizeDecimal,
} from "./amount.js";

export {
  FAMILY_EVM,
  FAMILY_SVM,
  NETWORKS,
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
} from "./types.js";
export type {
  ExactEvmAuthorization,
  InfiPaymentContext,
  PaymentPayload,
  PaymentRequirements,
  PaymentRequiredBody,
  PaymentResponseBody,
  RailAgent,
  RailAuthorization,
  RailNetwork,
  RailScheme,
  RailSettleResult,
  VerifiedBy,
} from "./types.js";

export type {
  RailConfigResponse,
  RailMeterPrice,
  RailSettleRequest,
  RailVerifyRequest,
  RailVerifyResponse,
} from "../resources/rail.js";
export { RailResource } from "../resources/rail.js";
