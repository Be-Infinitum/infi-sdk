import { createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import { verifyWebhook } from "./webhooks.js";

const secret = "whsec_test";
const body = '{"type":"payment.succeeded"}';
const now = Math.floor(Date.now() / 1000);
const sign = (id: string, ts: number, b: string, s = secret) =>
  "v1=" + createHmac("sha256", s).update(`${id}.${ts}.${b}`).digest("hex");
const req = (over: object = {}) => ({ id: "evt_1", timestamp: String(now), signature: sign("evt_1", now, body), body, ...over });

test("assinatura válida passa", () => {
  expect(verifyWebhook(req(), secret)).toBe(true);
});
test("aceita bytes e várias assinaturas (rotação)", () => {
  const sig = `${sign("evt_1", now, body, "old")} ${sign("evt_1", now, body)}`;
  expect(verifyWebhook(req({ signature: sig, body: new TextEncoder().encode(body) }), secret)).toBe(true);
});
test("corpo alterado falha", () => {
  expect(verifyWebhook(req({ body: body + " " }), secret)).toBe(false);
});
test("id, segredo ou formato errados falham", () => {
  expect(verifyWebhook(req({ id: "evt_2" }), secret)).toBe(false);
  expect(verifyWebhook(req(), "outro")).toBe(false);
  expect(verifyWebhook(req({ signature: "abc" }), secret)).toBe(false);
});
test("timestamp velho ou futuro falha", () => {
  const old = now - 400;
  expect(verifyWebhook(req({ timestamp: String(old), signature: sign("evt_1", old, body) }), secret)).toBe(false);
  expect(verifyWebhook(req({ timestamp: String(old), signature: sign("evt_1", old, body) }), secret, 500)).toBe(true);
  const fut = now + 400;
  expect(verifyWebhook(req({ timestamp: String(fut), signature: sign("evt_1", fut, body) }), secret)).toBe(false);
});
