/**
 * `X-PAYMENT` / `X-PAYMENT-RESPONSE` codecs.
 *
 * Both headers are base64 JSON. Decoding is done once, on the way in, and the
 * raw header string is carried through untouched — settlement replays the
 * verbatim header, because a rebuilt payload is a different payload.
 */

import { InfiError } from "../errors.js";
import {
  X402_VERSION,
  type ExactEvmAuthorization,
  type PaymentPayload,
  type PaymentResponseBody,
} from "./types.js";

function fromBase64(value: string): string {
  const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
  if (g.Buffer) return g.Buffer.from(value, "base64").toString("utf8");
  // Edge/browser runtimes: atob gives bytes-as-latin1, so decode UTF-8 by hand.
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toBase64(value: string): string {
  const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
  if (g.Buffer) return g.Buffer.from(value, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Raised when `X-PAYMENT` is present but unusable. Always answered with a 402. */
export class MalformedPaymentError extends InfiError {
  constructor(message: string) {
    super(`rail: ${message}`, 402, "invalid_payment");
    this.name = "MalformedPaymentError";
  }
}

/**
 * Decode the `X-PAYMENT` header into a payload.
 *
 * Structural only: nothing here proves the signature. Cryptography is the
 * facilitator's job, reached through Infi's `/verify` (§3.2).
 */
export function decodePaymentHeader(header: string): PaymentPayload {
  let json: string;
  try {
    json = fromBase64(header.trim());
  } catch {
    throw new MalformedPaymentError("X-PAYMENT is not valid base64");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new MalformedPaymentError("X-PAYMENT does not decode to JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new MalformedPaymentError("X-PAYMENT does not decode to an object");
  }
  const p = parsed as Partial<PaymentPayload>;
  if (p.x402Version !== X402_VERSION) {
    throw new MalformedPaymentError(
      `X-PAYMENT has x402Version ${String(p.x402Version)}; this server speaks ${X402_VERSION}`,
    );
  }
  if (p.scheme !== "exact") {
    throw new MalformedPaymentError(`unsupported scheme ${String(p.scheme)}`);
  }
  if (typeof p.network !== "string" || !p.network) {
    throw new MalformedPaymentError("X-PAYMENT is missing `network`");
  }
  if (!p.payload || typeof p.payload !== "object") {
    throw new MalformedPaymentError("X-PAYMENT is missing `payload`");
  }
  return { x402Version: p.x402Version, scheme: p.scheme, network: p.network, payload: p.payload };
}

/**
 * The EIP-3009 authorization inside an EVM payload.
 *
 * Absent on SVM, whose payload has a different shape — a caller that needs the
 * authorization (grace, exposure display) must handle `undefined` rather than
 * assume EVM.
 */
export function evmAuthorization(payload: PaymentPayload): ExactEvmAuthorization | undefined {
  const auth = payload.payload.authorization;
  if (!auth || typeof auth !== "object") return undefined;
  const a = auth as Partial<ExactEvmAuthorization>;
  if (
    typeof a.from !== "string" ||
    typeof a.to !== "string" ||
    typeof a.value !== "string" ||
    typeof a.validAfter !== "string" ||
    typeof a.validBefore !== "string" ||
    typeof a.nonce !== "string"
  ) {
    return undefined;
  }
  return { from: a.from, to: a.to, value: a.value, validAfter: a.validAfter, validBefore: a.validBefore, nonce: a.nonce };
}

/** Encode the settlement receipt for `X-PAYMENT-RESPONSE`. */
export function encodePaymentResponse(body: PaymentResponseBody): string {
  return toBase64(JSON.stringify(body));
}

/** Decode an `X-PAYMENT-RESPONSE` value. Exposed for tests and for clients. */
export function decodePaymentResponse(header: string): PaymentResponseBody {
  return JSON.parse(fromBase64(header.trim())) as PaymentResponseBody;
}

/** Encode a payload back to an `X-PAYMENT` header. Test/tooling helper. */
export function encodePaymentHeader(payload: PaymentPayload): string {
  return toBase64(JSON.stringify(payload));
}
