import { expect, test } from "bun:test";
import { collectOps, generate } from "./gen-facade.js";

const op = (over: Record<string, unknown> = {}) => ({
  operationId: "payments_list",
  tags: ["payments"],
  "x-infi-facade": true,
  "x-infi-scope": "payments:read",
  ...over,
});
const doc = (o: unknown) => ({ paths: { "/v1/payments": { get: o } } });

test("aceita operação válida e gera nome camelCase", () => {
  const ops = collectOps(doc(op({ operationId: "customers_get_wallet", tags: ["customers"] })));
  expect(ops[0]?.action).toBe("get_wallet");
  expect(generate(ops)).toContain("getWallet(");
});
test("rejeita operationId fora do padrão", () => {
  expect(() => collectOps(doc(op({ operationId: "listPayments" })))).toThrow(/payments_<ação/);
});
test("rejeita operação sem x-infi-scope", () => {
  expect(() => collectOps(doc(op({ "x-infi-scope": undefined })))).toThrow(/x-infi-scope/);
});
test("rejeita duas tags", () => {
  expect(() => collectOps(doc(op({ tags: ["payments", "usage"] })))).toThrow(/exatamente uma tag/);
});
test("rejeita operationId duplicado e falta de x-infi-facade", () => {
  const d = { paths: { "/a": { get: op() }, "/b": { get: op() } } };
  expect(() => collectOps(d)).toThrow(/duplicado/);
  expect(() => collectOps(doc(op({ "x-infi-facade": undefined })))).toThrow(/x-infi-facade/);
});
