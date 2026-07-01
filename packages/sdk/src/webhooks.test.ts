import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook } from "./webhooks.js";

const SECRET = "whsec_test";

function sign(id: string, ts: number, body: string): string {
  return "v1=" + createHmac("sha256", SECRET).update(`${id}.${ts}.${body}`).digest("hex");
}

describe("verifyWebhook", () => {
  const id = "evt_123";
  const body = JSON.stringify({ type: "invoice.paid", data: { id: "inv_1" } });

  it("accepts a valid signature and returns the parsed event", () => {
    const ts = Math.floor(Date.now() / 1000);
    const event = verifyWebhook({ id, timestamp: ts, signature: sign(id, ts, body), body }, SECRET);
    expect(event.type).toBe("invoice.paid");
    expect(event.id).toBe(id);
  });

  it("rejects a tampered body", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(id, ts, body);
    expect(() => verifyWebhook({ id, timestamp: ts, signature: sig, body: body + "x" }, SECRET)).toThrow();
  });

  it("rejects a stale timestamp", () => {
    const ts = Math.floor(Date.now() / 1000) - 10_000;
    expect(() => verifyWebhook({ id, timestamp: ts, signature: sign(id, ts, body), body }, SECRET)).toThrow();
  });

  it("rejects a wrong secret", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = "v1=" + createHmac("sha256", "wrong").update(`${id}.${ts}.${body}`).digest("hex");
    expect(() => verifyWebhook({ id, timestamp: ts, signature: sig, body }, SECRET)).toThrow();
  });
});
