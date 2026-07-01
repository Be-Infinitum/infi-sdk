import { createHmac, timingSafeEqual } from "node:crypto";
import { InfiError } from "./errors.js";

/** Events the backend actually emits (type travels in the X-Webhook-Event-Type header). */
export type WebhookEventType =
  | "customer.created"
  | "invoice.finalized"
  | "invoice.sent"
  | "invoice.voided"
  | "invoice.uncollectible"
  | "payment.confirmed"
  | "payment.failed";

// Payload bodies (flat JSON, decimals/uuids as strings; optional fields omitted).
export interface CustomerCreatedData {
  customerId: string;
  externalId: string;
  createdAt: string;
  name?: string;
  email?: string;
  taxId?: string;
}
export interface InvoiceAmountData {
  invoiceId: string;
  total: string;
  currency: string;
}
export interface InvoiceRefData {
  invoiceId: string;
}
export interface PaymentConfirmedData {
  paymentId: string;
  invoiceId: string;
  amount: string;
  currency: string;
}
export interface PaymentFailedData {
  paymentId: string;
  invoiceId: string;
}

/** Maps each event type to its payload shape (for `verifyWebhook<...>` narrowing). */
export interface WebhookEventMap {
  "customer.created": CustomerCreatedData;
  "invoice.finalized": InvoiceAmountData;
  "invoice.sent": InvoiceAmountData;
  "invoice.voided": InvoiceRefData;
  "invoice.uncollectible": InvoiceRefData;
  "payment.confirmed": PaymentConfirmedData;
  "payment.failed": PaymentFailedData;
}

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType | string;
  timestamp: number;
  /** Parsed JSON body. */
  data: T;
}

export interface WebhookInput {
  /** X-Webhook-Id */
  id: string;
  /** X-Webhook-Timestamp (unix seconds) */
  timestamp: string | number;
  /** X-Webhook-Signature (e.g. "v1=abc...") */
  signature: string;
  /** X-Webhook-Event-Type — the type lives in the header, not the body. */
  eventType: string;
  /** Raw request body (exact bytes/string). */
  body: string;
}

const DEFAULT_TOLERANCE_SECONDS = 300;

function computeHex(secret: string, id: string, ts: number, body: string): string {
  // Mirrors backend internal/webhook/signer.go: HMAC-SHA256 over id + "." + ts + "." + body.
  return createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("hex");
}

function parseSignatures(header: string): string[] {
  return header
    .split(/[\s,]+/)
    .map((part) => (part.includes("=") ? part.slice(part.indexOf("=") + 1) : part))
    .filter(Boolean);
}

/**
 * Verify an inbound Infi webhook and return the parsed event. Throws InfiError on a
 * bad signature or a timestamp outside the tolerance window (replay protection).
 * The event type comes from the `X-Webhook-Event-Type` header (`input.eventType`),
 * not the body. Pass a type param to narrow `data`, e.g.
 * `verifyWebhook<PaymentConfirmedData>(...)`.
 */
export function verifyWebhook<T = unknown>(
  input: WebhookInput,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): WebhookEvent<T> {
  const ts = typeof input.timestamp === "string" ? Number(input.timestamp) : input.timestamp;
  if (!Number.isFinite(ts)) {
    throw new InfiError("Invalid webhook timestamp", 400, "invalid_webhook");
  }
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (skew > toleranceSeconds) {
    throw new InfiError("Webhook timestamp outside tolerance", 400, "webhook_expired");
  }

  const expected = computeHex(secret, input.id, ts, input.body);
  const expectedBuf = Buffer.from(expected);
  const ok = parseSignatures(input.signature).some((candidate) => {
    const candBuf = Buffer.from(candidate);
    return candBuf.length === expectedBuf.length && timingSafeEqual(candBuf, expectedBuf);
  });
  if (!ok) {
    throw new InfiError("Invalid webhook signature", 400, "invalid_webhook_signature");
  }

  let data: T;
  try {
    data = JSON.parse(input.body) as T;
  } catch {
    throw new InfiError("Invalid webhook body", 400, "invalid_webhook");
  }

  return { id: input.id, type: input.eventType, timestamp: ts, data };
}
