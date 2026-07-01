import { createHmac, timingSafeEqual } from "node:crypto";
import { InfiError } from "./errors.js";

export type WebhookEventType =
  | "customer.created"
  | "invoice.finalized"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.voided"
  | "invoice.uncollectible"
  | "payment.confirmed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.chargeback";

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
  /** Raw request body (exact bytes/string). */
  body: string;
}

const DEFAULT_TOLERANCE_SECONDS = 300;

function computeHex(secret: string, id: string, ts: number, body: string): string {
  // Mirrors backend internal/webhook/signer.go: HMAC-SHA256 over id + "." + ts + "." + body.
  return createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("hex");
}

function parseSignatures(header: string): string[] {
  // Header may carry multiple space/comma-separated schemes: "v1=aaa,v1=bbb".
  return header
    .split(/[\s,]+/)
    .map((part) => (part.includes("=") ? part.slice(part.indexOf("=") + 1) : part))
    .filter(Boolean);
}

/**
 * Verify an inbound Infi webhook and return the parsed event. Throws InfiError on a
 * bad signature or a timestamp outside the tolerance window (replay protection).
 * Mirrors the backend signer byte-for-byte so it can be trusted server-side.
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

  const type =
    (data as { type?: string } | null)?.type ?? "unknown";
  return { id: input.id, type, timestamp: ts, data };
}
