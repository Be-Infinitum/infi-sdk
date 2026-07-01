import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook } from "./webhooks.js";

const SECRET = "whsec_test";

function sign(id: string, ts: number, body: string): string {
  return "v1=" + createHmac("sha256", SECRET).update(`${id}.${ts}.${body}`).digest("hex");
}

describe("verifyWebhook", () => {
  const id = "evt_123";
  const eventType = "payment.confirmed";
  const body = JSON.stringify({ paymentId: "pay_1", invoiceId: "inv_1", amount: "49.00", currency: "BRL" });

  it("accepts a valid signature and returns type from the header + parsed body", () => {
    const ts = Math.floor(Date.now() / 1000);
    const event = verifyWebhook({ id, eventType, timestamp: ts, signature: sign(id, ts, body), body }, SECRET);
    expect(event.type).toBe("payment.confirmed");
    expect(event.id).toBe(id);
    expect((event.data as { invoiceId: string }).invoiceId).toBe("inv_1");
  });

  it("rejects a tampered body", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(id, ts, body);
    expect(() => verifyWebhook({ id, eventType, timestamp: ts, signature: sig, body: body + "x" }, SECRET)).toThrow();
  });

  it("rejects a stale timestamp", () => {
    const ts = Math.floor(Date.now() / 1000) - 10_000;
    expect(() => verifyWebhook({ id, eventType, timestamp: ts, signature: sign(id, ts, body), body }, SECRET)).toThrow();
  });

  it("rejects a wrong secret", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = "v1=" + createHmac("sha256", "wrong").update(`${id}.${ts}.${body}`).digest("hex");
    expect(() => verifyWebhook({ id, eventType, timestamp: ts, signature: sig, body }, SECRET)).toThrow();
  });
});
