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

describe("WEBHOOK_EVENT_TYPES", () => {
  it("carries the events the backend actually emits", async () => {
    const { WEBHOOK_EVENT_TYPES } = await import("./webhooks.js");
    // The hand-written union had gone stale: it omitted invoice.paid (emitted at
    // internal/payment/service.go), payment.refunded and payment.chargeback.
    // Anyone reading it concluded invoice.paid did not exist.
    expect(WEBHOOK_EVENT_TYPES).toContain("invoice.paid");
    expect(WEBHOOK_EVENT_TYPES).toContain("payment.refunded");
    expect(WEBHOOK_EVENT_TYPES).toContain("payment.chargeback");
    expect(WEBHOOK_EVENT_TYPES).toContain("payment.confirmed");
    // E os que uma união fechada demais recusava: checkout.session.* é como se
    // confirma uma compra sem pagador logado.
    expect(WEBHOOK_EVENT_TYPES).toContain("checkout.session.completed");
    expect(WEBHOOK_EVENT_TYPES).toContain("invoice.auto_collection_failed");
  });

  it("narrows payment.confirmed to a payload that identifies the buyer", async () => {
    const { verifyWebhook } = await import("./webhooks.js");
    const secret = "s3cr3t";
    const body = JSON.stringify({
      paymentId: "pay_1",
      invoiceId: "inv_1",
      amount: "19.90",
      currency: "BRL",
      customerId: "enr_1",
      payerId: "cus_1",
    });
    const id = "evt_1";
    const ts = Math.floor(Date.now() / 1000);
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("hex");

    const ev = verifyWebhook<import("./webhooks.js").PaymentConfirmedData>(
      { id, timestamp: ts, signature: `v1=${sig}`, eventType: "payment.confirmed", body },
      secret,
    );
    expect(ev.data.customerId).toBe("enr_1");
    expect(ev.data.payerId).toBe("cus_1");
  });
});

// ── Contrato: os tipos escritos à mão têm que bater com o openapi.yaml ────────
//
// É por aqui que o drift entrava. WebhookEventType era uma união escrita à mão
// que espelhava o backend sem nada checando se ainda batia — e ficou velha,
// omitindo invoice.paid, payment.refunded e payment.chargeback. Quem lia o tipo
// concluía que os eventos não existiam.
//
// Agora o backend declara o enum no openapi.yaml, o codegen o traz, e este
// teste falha se a lista de runtime divergir. O drift deixa de depender de
// alguém lembrar.
describe("contrato com o openapi", () => {
  it("WEBHOOK_EVENT_TYPES é exatamente o enum do backend", async () => {
    const { WEBHOOK_EVENT_TYPES } = await import("./webhooks.js");
    type Generated = import("./generated/openapi.js").components["schemas"]["WebhookEventType"];

    // Falha em compilação se a lista tiver um evento que o backend não declara...
    const _each: Generated[] = [...WEBHOOK_EVENT_TYPES];
    // ...e se o backend declarar um que a lista não tem.
    // A exaustividade real mora em _Exhaustive, no webhooks.ts.

    expect(new Set(WEBHOOK_EVENT_TYPES).size).toBe(WEBHOOK_EVENT_TYPES.length);
  });
});
