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

test("accepts a valid operation and generates a camelCase name", () => {
  const ops = collectOps(doc(op({ operationId: "customers_get_wallet", tags: ["customers"] })));
  expect(ops[0]?.action).toBe("get_wallet");
  expect(generate(ops)).toContain("getWallet(");
});
test("rejects an operationId outside the pattern", () => {
  expect(() => collectOps(doc(op({ operationId: "listPayments" })))).toThrow(/payments_<action/);
});
test("rejects an operation without x-infi-scope", () => {
  expect(() => collectOps(doc(op({ "x-infi-scope": undefined })))).toThrow(/x-infi-scope/);
});
test("rejects two tags", () => {
  expect(() => collectOps(doc(op({ tags: ["payments", "usage"] })))).toThrow(/exactly one tag/);
});
test("rejects a duplicated operationId and a missing x-infi-facade", () => {
  const d = { paths: { "/a": { get: op() }, "/b": { get: op() } } };
  expect(() => collectOps(d)).toThrow(/duplicated/);
  expect(() => collectOps(doc(op({ "x-infi-facade": undefined })))).toThrow(/x-infi-facade/);
});
