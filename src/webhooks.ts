// Camada manuscrita (ADR 0055, D3): verificação de webhook.
// Esquema de backend/internal/messaging/webhook/signer.go:
//   signed_content = id + "." + timestamp + "." + body
//   signature      = "v1=" + hex(HMAC_SHA256(secret, signed_content))
// O header pode trazer várias assinaturas separadas por espaço (rotação).
import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookRequest {
  /** Header X-Webhook-Id. */
  id: string;
  /** Header X-Webhook-Timestamp (segundos Unix). */
  timestamp: string | number;
  /** Header X-Webhook-Signature. */
  signature: string;
  /** Corpo cru, exatamente como recebido. */
  body: string | Uint8Array;
}

export function verifyWebhook(
  req: WebhookRequest,
  secret: string | string[],
  toleranceSeconds = 300,
  now: () => number = () => Date.now(),
): boolean {
  const ts = Number(req.timestamp);
  if (!Number.isInteger(ts)) return false;
  if (Math.abs(now() / 1000 - ts) > toleranceSeconds) return false;
  const candidates: string[] = [];
  for (const part of req.signature.split(/\s+/)) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i) !== "v1" || i === part.length - 1) continue;
    candidates.push(part.slice(i + 1));
  }
  if (candidates.length === 0) return false;
  const body = typeof req.body === "string" ? Buffer.from(req.body, "utf8") : Buffer.from(req.body);
  for (const key of Array.isArray(secret) ? secret : [secret]) {
    const want = createHmac("sha256", key).update(`${req.id}.${ts}.`).update(body).digest();
    for (const c of candidates) {
      const got = Buffer.from(c, "hex");
      if (got.length === want.length && timingSafeEqual(got, want)) return true;
    }
  }
  return false;
}
