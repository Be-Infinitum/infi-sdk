import { expect, test } from "bun:test";
import { OPERATIONS } from "./generated/facade.js";
import { Infi } from "./index.js";

const infi = new Infi({ secretKey: "sk_test_x" });

test("every contract operation has a method at infi[tag][action]", () => {
  expect(OPERATIONS.length).toBe(28);
  for (const o of OPERATIONS) {
    const res = (infi as any)[o.property];
    expect(res, o.operationId).toBeDefined();
    expect(typeof res[o.method], o.operationId).toBe("function");
  }
});

test("expected names", () => {
  expect(typeof infi.customers.getWallet).toBe("function");
  expect(typeof infi.config.plan).toBe("function");
  expect(typeof infi.customerSessions.create).toBe("function");
});

test("builds the URL, path params, query, body and options", async () => {
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

// Type checks (run by `tsc --noEmit`): the generated types must not become any.
export async function _types() {
  // @ts-expect-error customerId is required in the path
  await infi.customers.get({ path: {} });
  // @ts-expect-error unknown option
  await infi.payments.list({}, { nope: 1 });
  const r = await infi.payments.get({ path: { paymentId: "p" } });
  // @ts-expect-error field does not exist on the response
  r.doesNotExist;
  const pd = await infi.products.getDraft({ path: { draftKey: "k" } });
  pd.draftHash.toUpperCase();
  pd.offer.name.toUpperCase();
  // @ts-expect-error field does not exist on the product draft
  pd.doesNotExist;
  const ld = await infi.links.getDraft({ path: { draftKey: "k" } });
  ld.preview.currency.toUpperCase();
  // @ts-expect-error field does not exist on the link draft
  ld.doesNotExist;
}
