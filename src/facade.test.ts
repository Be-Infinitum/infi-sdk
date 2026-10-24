import { expect, test } from "bun:test";
import { OPERATIONS } from "./generated/facade.js";
import { Infi } from "./index.js";

const infi = new Infi({ secretKey: "sk_test_x" });

test("toda operação do contrato tem método em infi[tag][ação]", () => {
  expect(OPERATIONS.length).toBe(21);
  for (const o of OPERATIONS) {
    const res = (infi as any)[o.property];
    expect(res, o.operationId).toBeDefined();
    expect(typeof res[o.method], o.operationId).toBe("function");
  }
});

test("nomes esperados", () => {
  expect(typeof infi.customers.getWallet).toBe("function");
  expect(typeof infi.config.plan).toBe("function");
  expect(typeof infi.customerSessions.create).toBe("function");
});

test("monta URL, path params, query, body e opções", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const c = new Infi({
    secretKey: "sk_test_x",
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"ok":true}', { status: 200 });
    }) as any,
  });
  await c.customers.getWallet({ path: { enrollmentId: "c 1" }, query: { meter: "m1" } } as any);
  await c.config.apply({ body: { document: {} } } as any, { ifMatch: '"h"', channel: "cli", idempotencyKey: "k1" });
  expect(calls[0]!.url).toBe("https://api-sandbox.beinfi.com/v1/customers/c%201/wallet?meter=m1");
  const h = calls[1]!.init.headers as Record<string, string>;
  expect(h["If-Match"]).toBe('"h"');
  expect(h["X-Infi-Channel"]).toBe("cli");
  expect(h["Idempotency-Key"]).toBe("k1");
  expect(calls[1]!.init.body).toBe('{"document":{}}');
});

// Verificação de tipos (roda no `tsc --noEmit`): os tipos gerados não podem virar any.
export async function _types() {
  // @ts-expect-error customerId é obrigatório no path
  await infi.customers.get({ path: {} });
  // @ts-expect-error opção desconhecida
  await infi.payments.list({}, { nope: 1 });
  const r = await infi.payments.get({ path: { paymentId: "p" } });
  // @ts-expect-error campo inexistente na resposta
  r.naoExiste;
  const pd = await infi.products.getDraft({ path: { draftKey: "k" } });
  pd.draftHash.toUpperCase();
  pd.offer.name.toUpperCase();
  // @ts-expect-error campo inexistente no rascunho de produto
  pd.naoExiste;
  const ld = await infi.links.getDraft({ path: { draftKey: "k" } });
  ld.preview.currency.toUpperCase();
  // @ts-expect-error campo inexistente no rascunho de link
  ld.naoExiste;
}
