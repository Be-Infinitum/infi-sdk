import { createHmac, timingSafeEqual } from "node:crypto";
import { InfiError } from "./errors.js";
import type { components } from "./generated/openapi.js";

/**
 * The backend declares the event vocabulary in openapi.yaml; codegen brings it
 * here. Deriving instead of restating is the whole point — the hand-written
 * union had gone stale, omitting invoice.paid, payment.refunded and
 * payment.chargeback, so readers concluded those events did not exist.
 */
type GeneratedEventType = components["schemas"]["WebhookEventType"];

/**
 * Events the backend emits (the type travels in the X-Webhook-Event-Type header).
 *
 * A runtime list, not just a union: `sync` validates declared webhook events
 * against it, so a typo or an unsupported name fails before an endpoint that
 * can never fire is registered.
 */
export const WEBHOOK_EVENT_TYPES = [
  "checkout.session.created",
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.created",
  "invoice.finalized",
  "invoice.sent",
  "invoice.paid",
  "invoice.voided",
  "invoice.uncollectible",
  "invoice.auto_collection_failed",
  "payment.confirmed",
  "payment.failed",
  "payment.refunded",
  "payment.refund_reversed",
  "payment.chargeback",
  "payment.chargeback_reversed",
  "usage.threshold_reached",
] as const satisfies readonly GeneratedEventType[];

/**
 * Events with a documented payload.
 *
 * `(string & {})` de propósito: o backend despacha por
 * `event_type = ANY(events)`, sem allowlist, então QUALQUER evento do outbox é
 * assinável. Fechar esta união recusaria eventos reais — foi o que aconteceu
 * quando ela listava só os 10 da descrição em prosa, e `checkout.session.*` e
 * `invoice.auto_collection_failed` passaram a dar erro no cliente.
 *
 * O literal conhecido continua autocompletando; o desconhecido passa.
 */
export type WebhookEventType = GeneratedEventType | (string & {});

/** Compile error if the backend declares an event the list above is missing. */
type _Exhaustive = Exclude<GeneratedEventType, (typeof WEBHOOK_EVENT_TYPES)[number]> extends never
  ? true
  : ["WEBHOOK_EVENT_TYPES is missing an event the backend declares", Exclude<GeneratedEventType, (typeof WEBHOOK_EVENT_TYPES)[number]>];
const _exhaustive: _Exhaustive = true;
void _exhaustive;

// ── Payload bodies ───────────────────────────────────────────────────────────
//
// Derived from openapi.yaml, not restated. These used to be hand-written and
// drifted: PaymentConfirmedData had no customerId, CustomerCreatedData had no
// country, and payment.refunded was mapped onto PaymentFailedData — losing
// amount, currency and accessRevoked entirely.

type Schemas = components["schemas"];

export type CustomerCreatedData = Schemas["CustomerCreatedData"];
export type InvoiceAmountData = Schemas["InvoiceAmountData"];
export type InvoicePaidData = Schemas["InvoicePaidData"];
export type InvoiceRefData = Schemas["InvoiceRefData"];
export type PaymentConfirmedData = Schemas["PaymentConfirmedData"];
export type PaymentFailedData = Schemas["PaymentFailedData"];
/** payment.refunded / payment.chargeback. `accessRevoked` says whether the
 *  buyer's deliverable downloads were cut, so you can mirror it in your own
 *  entitlements. */
export type PaymentReversedData = Schemas["PaymentReversedData"];

/** Maps each event type to its payload shape (for `verifyWebhook<...>` narrowing). */
export interface WebhookEventMap {
  "customer.created": CustomerCreatedData;
  "invoice.finalized": InvoiceAmountData;
  "invoice.sent": InvoiceAmountData;
  "invoice.paid": InvoicePaidData;
  "invoice.voided": InvoiceRefData;
  "invoice.uncollectible": InvoiceRefData;
  "payment.confirmed": PaymentConfirmedData;
  "payment.failed": PaymentFailedData;
  "payment.refunded": PaymentReversedData;
  "payment.chargeback": PaymentReversedData;
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
