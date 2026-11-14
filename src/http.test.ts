import { expect, test } from "bun:test";
import { Infi } from "./index.js";
import { InfiError, Transport } from "./http.js";

type Call = { url: string; headers: Record<string, string> };
function setup(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let i = 0;
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    if (r instanceof Error) throw r;
    return r.clone();
  }) as any;
  const infi = new Infi({ secretKey: "sk_live_x", fetch, sleep: async (ms) => void sleeps.push(ms) });
  return { infi, calls, sleeps };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const rec = { body: { customerId: "c", meter: "m", value: 1 } } as any;

test("URL pela chave e Bearer; POST manda Idempotency-Key uuid", async () => {
  const { infi, calls } = setup([json(200, {})]);
  await infi.usage.record(rec);
  expect(calls[0]!.url).toStartWith("https://api.beinfi.com/v1/usage/events");
  expect(calls[0]!.headers.Authorization).toBe("Bearer sk_live_x");
  expect(calls[0]!.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
});

test("GET não manda Idempotency-Key", async () => {
  const { infi, calls } = setup([json(200, { data: [], nextCursor: null })]);
  await infi.payments.list();
  expect(calls[0]!.headers["Idempotency-Key"]).toBeUndefined();
});

test("apiUrl explícito vence; sandbox por prefixo", async () => {
  const a = setup([json(200, {})]);
  const c = new Infi({ secretKey: "sk_test_x", apiUrl: "http://localhost:8088/", fetch: (async (u: string) => (a.calls.push({ url: u, headers: {} }), json(200, {}))) as any });
  await c.payments.list();
  expect(a.calls[0]!.url).toStartWith("http://localhost:8088/v1/payments");
  expect(() => new Infi({ secretKey: "bad" })).toThrow();
});

test("503 repete com a mesma Idempotency-Key e depois sucede", async () => {
  const { infi, calls, sleeps } = setup([json(503, {}), json(503, {}), json(200, { ok: 1 })]);
  expect(await infi.usage.record(rec)).toEqual({ ok: 1 } as any);
  expect(calls.length).toBe(3);
  expect(new Set(calls.map((c) => c.headers["Idempotency-Key"])).size).toBe(1);
  expect(sleeps).toEqual([250, 1000]);
});

test("erro de rede repete; esgota em 3 tentativas", async () => {
  const { infi, calls } = setup([new Error("boom")]);
  const e = await infi.usage.record(rec).catch((x) => x);
  expect(e).toBeInstanceOf(InfiError);
  expect(e.code).toBe("network_error");
  expect(calls.length).toBe(3);
});

test("400 não repete", async () => {
  const { infi, calls } = setup([json(400, { error_code: "bad_request", message: "x", tracer_id: "t1" })]);
  await expect(infi.usage.record(rec)).rejects.toMatchObject({ status: 400, code: "bad_request", tracerId: "t1" });
  expect(calls.length).toBe(1);
});

test("envelope aninhado vira InfiError", async () => {
  const { infi } = setup([json(409, { error: { code: "idempotency_key_reused", message: "m", request_id: "r9" } })]);
  const e = await infi.usage.record(rec).catch((x) => x);
  expect(e).toBeInstanceOf(InfiError);
  expect(e).toMatchObject({ status: 409, code: "idempotency_key_reused", message: "m", tracerId: "r9" });
});

test("envelope plano com errors[] guarda details", async () => {
  const { infi } = setup([json(422, { error_code: "validation_failed", message: "m", tracer_id: "t", errors: [{ field: "a" }] })]);
  const e = await infi.usage.record(rec).catch((x) => x);
  expect(e.details).toEqual([{ field: "a" }]);
});

test("412 carrega current", async () => {
  const { infi } = setup([json(412, { error_code: "plan_changed", message: "m", tracer_id: "t", current: { planHash: "H2" } })]);
  const e = await infi.config.apply({ body: { document: {} } } as any, { ifMatch: '"H1"' }).catch((x) => x);
  expect(e.status).toBe(412);
  expect(e.current).toEqual({ planHash: "H2" });
});

test("Retry-After é respeitado em 429", async () => {
  const { infi, sleeps } = setup([json(429, { error: { code: "rate_limited", message: "m", request_id: "r" } }, { "Retry-After": "2" }), json(200, {})]);
  await infi.usage.record(rec);
  expect(sleeps).toEqual([2000]);
});

test("204 devolve undefined", async () => {
  const t = new Transport({ secretKey: "sk_test_x", fetch: (async () => new Response(null, { status: 204 })) as any });
  expect(await t.request({ method: "POST", path: "/v1/x" })).toBeUndefined();
});
