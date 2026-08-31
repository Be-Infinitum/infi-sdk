import { afterEach, describe, expect, it } from "vitest";
import { Infi } from "../client.js";
import { requirePayment } from "./express.js";
import type { ExpressRequestLike, PaymentMiddleware } from "./express.js";
import { decodePaymentResponse, encodePaymentHeader } from "./header.js";
import type { ExactEvmAuthorization, PaymentRequiredBody } from "./types.js";

const BASE = "https://api.test";
const WALLET = "0xMerchantWallet";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Settings supplied by hand, so these tests never guess an asset's decimals. */
const SETTINGS = {
  network: "base",
  asset: USDC,
  assetDecimals: 6,
  extra: { name: "USDC", version: "2" },
  meters: {
    searches: { unitAmount: "0.005", description: "Web search, one query" },
    tokens: { unitAmount: "0.0001" },
  },
};

// ── the stubbed Infi endpoint ───────────────────────────────────────────────

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

type Reply = Response | Error;
type Handler = (call: Call) => Reply;

const realFetch = globalThis.fetch;
let calls: Call[] = [];

function stubInfi(handler: Handler): void {
  calls = [];
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? "GET",
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const reply = handler(call);
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Infi answers `isValid: true` for anything. */
function verifyOk(payer = "0xPayer"): Handler {
  return (call) =>
    call.url.endsWith("/rail/verify")
      ? json({ isValid: true, payer, agent: { id: "agt_1", enrollmentId: "enr_1", address: payer, network: "base" } })
      : json({});
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ── the agent side, faked ───────────────────────────────────────────────────

/**
 * Build an `X-PAYMENT` header. The SDK never signs — this is what the AGENT
 * would send, and the `signature` here is a placeholder because nothing on the
 * seller side inspects it (the facilitator does, through Infi's /verify).
 */
function paymentHeader(over: Partial<ExactEvmAuthorization> = {}, network = "base"): string {
  const now = Math.floor(Date.now() / 1000);
  const authorization: ExactEvmAuthorization = {
    from: "0xPayer",
    to: WALLET,
    value: "5000",
    validAfter: String(now - 10),
    validBefore: String(now + 600),
    nonce: `0x${"ab".repeat(32)}`,
    ...over,
  };
  return encodePaymentHeader({
    x402Version: 1,
    scheme: "exact",
    network,
    payload: { signature: `0x${"11".repeat(65)}`, authorization },
  });
}

// ── a fake Express ──────────────────────────────────────────────────────────

interface RunResult {
  released: boolean;
  status: number;
  body: PaymentRequiredBody;
  headers: Record<string, string>;
  req: ExpressRequestLike;
  error?: unknown;
}

function run(mw: PaymentMiddleware, headers: Record<string, string> = {}, method = "GET"): Promise<RunResult> {
  const req: ExpressRequestLike = {
    method,
    url: "/v1/search?q=infi",
    originalUrl: "/v1/search?q=infi",
    protocol: "https",
    headers: { host: "api.merchant.com", ...headers },
  };
  const out: Record<string, string> = {};
  let status = 200;
  return new Promise<RunResult>((resolve) => {
    const res = {
      setHeader(name: string, value: string) {
        out[name] = value;
      },
      status(code: number) {
        status = code;
        return {
          json(body: unknown) {
            resolve({ released: false, status, body: body as PaymentRequiredBody, headers: out, req });
          },
        };
      },
    };
    mw(req, res, (err?: unknown) => {
      resolve({
        released: err === undefined,
        status,
        body: {} as PaymentRequiredBody,
        headers: out,
        req,
        ...(err !== undefined ? { error: err } : {}),
      });
    });
  });
}

function client(): Infi {
  return new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
}

async function mount(overrides: Record<string, unknown> = {}) {
  return requirePayment(client(), {
    product: "serp-api",
    wallet: WALLET,
    settings: SETTINGS,
    ...overrides,
  });
}

// ── 1. no X-PAYMENT ─────────────────────────────────────────────────────────

describe("no X-PAYMENT", () => {
  it("answers 402 with the measured x402 body, and calls nothing", async () => {
    stubInfi(() => json({}));
    const pay = await mount();
    const result = await run(pay({ meter: "searches" }));

    expect(result.status).toBe(402);
    expect(result.body.x402Version).toBe(1);
    expect(result.body.error).toBe("X-PAYMENT header is required");
    expect(result.body.accepts).toHaveLength(1);
    expect(result.body.accepts[0]).toEqual({
      scheme: "exact",
      network: "base",
      // 0.005 USDC at six decimals. Not "0.005".
      maxAmountRequired: "5000",
      resource: "https://api.merchant.com/v1/search?q=infi",
      description: "Web search, one query",
      mimeType: "",
      payTo: WALLET,
      maxTimeoutSeconds: 60,
      asset: USDC,
      outputSchema: { input: { type: "http", method: "GET", discoverable: true } },
      extra: { name: "USDC", version: "2" },
    });
    // §5 step 1: no Infi call, no database write.
    expect(calls).toHaveLength(0);
  });

  it("prices a variable route at its ceiling", async () => {
    stubInfi(() => json({}));
    const pay = await mount();
    const result = await run(pay({ meter: "tokens", max: 8000 }), {}, "POST");
    // 8000 tokens x $0.0001 = $0.80 = 800000 atomic units.
    expect(result.body.accepts[0]?.maxAmountRequired).toBe("800000");
    expect(result.body.accepts[0]?.outputSchema).toEqual({
      input: { type: "http", method: "POST", discoverable: true },
    });
  });

  it("can be kept out of the discovery index", async () => {
    stubInfi(() => json({}));
    const pay = await mount();
    const result = await run(pay({ meter: "searches", discoverable: false }));
    expect(result.body.accepts[0]?.outputSchema).toBeUndefined();
  });
});

// ── 2. with X-PAYMENT ───────────────────────────────────────────────────────

describe("with X-PAYMENT", () => {
  it("verifies with Infi, releases the handler, and answers X-PAYMENT-RESPONSE", async () => {
    stubInfi(verifyOk());
    const pay = await mount();
    const header = paymentHeader();
    const result = await run(pay({ meter: "searches" }), { "x-payment": header });

    expect(result.released).toBe(true);

    const verify = calls.find((c) => c.url.endsWith("/rail/verify"));
    expect(verify?.method).toBe("POST");
    expect(verify?.body.product).toBe("serp-api");
    expect(verify?.body.meter).toBe("searches");
    // The header verbatim: settlement replays it, never a rebuild.
    expect(verify?.body.payment).toBe(header);
    expect(verify?.body.paymentPayload).toMatchObject({ x402Version: 1, scheme: "exact", network: "base" });
    expect(verify?.body.paymentRequirements).toMatchObject({ maxAmountRequired: "5000", payTo: WALLET });

    const receipt = decodePaymentResponse(result.headers["X-PAYMENT-RESPONSE"] as string);
    expect(receipt).toEqual({ success: true, transaction: "", network: "base", payer: "0xPayer" });
  });

  it("puts agent, authorization and verifiedBy on req.infi", async () => {
    stubInfi(verifyOk());
    const pay = await mount();
    const result = await run(pay({ meter: "searches" }), { "x-payment": paymentHeader() });

    const ctx = result.req.infi;
    expect(ctx?.verifiedBy).toBe("infi");
    expect(ctx?.agent).toMatchObject({ address: "0xPayer", network: "base", enrollmentId: "enr_1" });
    expect(ctx?.authorization).toMatchObject({
      payer: "0xPayer",
      payTo: WALLET,
      asset: USDC,
      valueAtomic: "5000",
      // The one conversion, surfaced for the merchant's own books.
      valueDecimal: "0.005",
      meter: "searches",
    });
  });

  it("refuses with the reason Infi gave", async () => {
    stubInfi((call) =>
      call.url.endsWith("/rail/verify")
        ? json({ isValid: false, invalidReason: "insufficient_funds", payer: "0xPayer" })
        : json({}),
    );
    const pay = await mount();
    const result = await run(pay({ meter: "searches" }), { "x-payment": paymentHeader() });

    expect(result.status).toBe(402);
    expect(result.body.error).toBe("insufficient_funds");
    expect(result.body.accepts[0]?.maxAmountRequired).toBe("5000");
  });

  it("refuses a payment addressed to someone else, without asking Infi", async () => {
    stubInfi(verifyOk());
    const pay = await mount();
    const result = await run(pay({ meter: "searches" }), {
      "x-payment": paymentHeader({ to: "0xSomeoneElse" }),
    });

    expect(result.status).toBe(402);
    expect(result.body.error).toBe("invalid_exact_evm_payload_recipient_mismatch");
    expect(calls).toHaveLength(0);
  });

  it("refuses a payment worth less than the route costs", async () => {
    stubInfi(verifyOk());
    const pay = await mount();
    const result = await run(pay({ meter: "searches" }), {
      "x-payment": paymentHeader({ value: "4999" }),
    });
    expect(result.body.error).toBe("insufficient_funds");
    expect(calls).toHaveLength(0);
  });

  it("refuses an expired authorization", async () => {
    stubInfi(verifyOk());
    const pay = await mount();
    const past = Math.floor(Date.now() / 1000) - 3600;
    const result = await run(pay({ meter: "searches" }), {
      "x-payment": paymentHeader({ validAfter: String(past - 60), validBefore: String(past) }),
    });
    expect(result.body.error).toBe("payment_expired");
  });

  it("refuses a header that is not a payment", async () => {
    stubInfi(verifyOk());
    const pay = await mount();
    const result = await run(pay({ meter: "searches" }), { "x-payment": "not-base64-json" });
    expect(result.body.error).toBe("invalid_payment");
    expect(calls).toHaveLength(0);
  });

  it("raises the merchant's own misconfiguration instead of serving or refusing", async () => {
    // A 401 means the key is wrong. Grace must not cover that up, and neither
    // must a 402 — the merchant has to see it.
    stubInfi(() => json({ message: "invalid key", code: "invalid_key" }, 401));
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "0.50" } });
    const result = await run(pay({ meter: "searches" }), { "x-payment": paymentHeader() });

    expect(result.released).toBe(false);
    expect((result.error as { status?: number })?.status).toBe(401);
  });
});

// ── 3. settle: the variable-price true-up ───────────────────────────────────

describe("req.infi.settle", () => {
  it("reports the real quantity, keyed by the same nonce as the claim", async () => {
    stubInfi((call) => (call.url.endsWith("/rail/settle") ? json({ status: "recorded" }) : verifyOk()(call)));
    const pay = await mount();
    const result = await run(pay({ meter: "tokens", max: 8000 }), {
      "x-payment": paymentHeader({ value: "800000" }),
    });

    const out = await result.req.infi!.settle({ quantity: 1372 });
    expect(out).toEqual({ accepted: true, status: "recorded" });

    const settle = calls.find((c) => c.url.endsWith("/rail/settle"));
    expect(settle?.body).toEqual({
      network: "base",
      payer: "0xPayer",
      nonce: `0x${"ab".repeat(32)}`,
      quantity: "1372",
      meter: "tokens",
    });
  });
});

// ── 4. grace (§6) ───────────────────────────────────────────────────────────

describe("grace", () => {
  const outage: Handler = (call) =>
    call.url.endsWith("/rail/verify") ? json({ message: "upstream" }, 503) : json({});

  it("refuses with verification_unavailable when grace is not configured", async () => {
    stubInfi(outage);
    const pay = await mount();
    const result = await run(pay({ meter: "searches" }), { "x-payment": paymentHeader() });

    expect(result.status).toBe(402);
    expect(result.body.error).toBe("verification_unavailable");
    expect(result.req.infi).toBeUndefined();
  });

  it("serves on the allowance while Infi is unreachable, and says so", async () => {
    stubInfi(outage);
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "0.50" } });
    const result = await run(pay({ meter: "searches" }), { "x-payment": paymentHeader() });

    expect(result.released).toBe(true);
    expect(result.req.infi?.verifiedBy).toBe("grace");
    // Debited by the authorization's value, converted once.
    expect(pay.rail.grace.remainingFor("0xPayer")).toBe("0.495");
    expect(pay.rail.grace.pending).toBe(1);
  });

  it("refuses once the allowance runs out — never fails open", async () => {
    stubInfi(outage);
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "0.005" } });
    const middleware = pay({ meter: "searches" });

    const first = await run(middleware, { "x-payment": paymentHeader() });
    expect(first.released).toBe(true);

    const second = await run(middleware, {
      "x-payment": paymentHeader({ nonce: `0x${"cd".repeat(32)}` }),
    });
    expect(second.status).toBe(402);
    expect(second.body.error).toBe("verification_unavailable");
  });

  it("refuses a replayed nonce during an outage", async () => {
    stubInfi(outage);
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "0.50" } });
    const middleware = pay({ meter: "searches" });
    const header = paymentHeader();

    expect((await run(middleware, { "x-payment": header })).released).toBe(true);
    const replay = await run(middleware, { "x-payment": header });
    expect(replay.status).toBe(402);
    expect(replay.body.error).toBe("invalid_payment");
  });

  it("caps the whole process, which is the only bound a forged payer cannot dodge", async () => {
    stubInfi(outage);
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "0.50", maxTotal: "0.005" } });
    const middleware = pay({ meter: "searches" });

    expect((await run(middleware, { "x-payment": paymentHeader() })).released).toBe(true);
    const forged = await run(middleware, {
      "x-payment": paymentHeader({ from: "0xForged", nonce: `0x${"ef".repeat(32)}` }),
    });
    expect(forged.status).toBe(402);
    expect(forged.body.error).toBe("verification_unavailable");
  });

  it("checks the signature when a verifier is supplied", async () => {
    stubInfi(outage);
    const pay = await mount({
      grace: { window: "5m", maxPerAgent: "0.50", verifySignature: () => false },
    });
    const result = await run(pay({ meter: "searches" }), { "x-payment": paymentHeader() });
    expect(result.body.error).toBe("invalid_exact_evm_payload_signature");
  });

  it("replays queued payloads once Infi answers again", async () => {
    stubInfi(outage);
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "0.50" } });
    const middleware = pay({ meter: "searches" });
    await run(middleware, { "x-payment": paymentHeader() });
    expect(pay.rail.grace.pending).toBe(1);

    stubInfi(verifyOk());
    const flushed = await pay.rail.flushGrace();

    expect(flushed).toEqual({ replayed: 1, refused: 0, requeued: 0 });
    const replay = calls.find((c) => c.url.endsWith("/rail/verify"));
    // Marked so Infi records what it is: an authorization nobody verified.
    expect(replay?.body.verifiedBy).toBe("grace");
    expect(pay.rail.grace.pending).toBe(0);
  });

  it("drops a replay that lost the claim, and keeps the rest when Infi is still down", async () => {
    stubInfi(outage);
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "0.50" } });
    const middleware = pay({ meter: "searches" });
    await run(middleware, { "x-payment": paymentHeader() });
    await run(middleware, { "x-payment": paymentHeader({ nonce: `0x${"cd".repeat(32)}` }) });

    let first = true;
    stubInfi((call) => {
      if (!call.url.endsWith("/rail/verify")) return json({});
      if (first) {
        first = false;
        // A replay that loses the claim was a duplicate. Not an error.
        return json({ isValid: false, invalidReason: "invalid_payment" });
      }
      return new Error("fetch failed");
    });
    const flushed = await pay.rail.flushGrace();

    expect(flushed).toEqual({ replayed: 0, refused: 1, requeued: 1 });
    expect(pay.rail.grace.pending).toBe(1);
  });

  it("queues the true-up with the payload when settle happens during an outage", async () => {
    stubInfi(outage);
    // Ceiling is $0.80, so the allowance has to cover it.
    const pay = await mount({ grace: { window: "5m", maxPerAgent: "1.00" } });
    const result = await run(pay({ meter: "tokens", max: 8000 }), {
      "x-payment": paymentHeader({ value: "800000" }),
    });

    const out = await result.req.infi!.settle({ quantity: 1372 });
    expect(out).toEqual({ accepted: false, status: "queued" });

    stubInfi(verifyOk());
    await pay.rail.flushGrace();
    expect(calls.find((c) => c.url.endsWith("/rail/verify"))?.body.quantity).toBe("1372");
  });
});

// ── 5. mount ────────────────────────────────────────────────────────────────

describe("requirePayment mount", () => {
  it("reads settings from Infi when the merchant supplies none", async () => {
    stubInfi((call) =>
      call.url.includes("/rail/config")
        ? json({
            network: "base",
            asset: USDC,
            assetDecimals: 6,
            payTo: WALLET,
            maxTimeoutSeconds: 120,
            extra: { name: "USDC", version: "2" },
            meters: { searches: { unitAmount: "0.01" } },
            grace: { window: "5m", maxPerAgent: "0.50" },
          })
        : json({}),
    );
    const pay = await requirePayment(client(), { product: "serp-api", wallet: WALLET });
    const result = await run(pay({ meter: "searches" }));

    expect(calls[0]?.url).toBe(`${BASE}/rail/config?product=serp-api`);
    expect(result.body.accepts[0]?.maxAmountRequired).toBe("10000");
    expect(result.body.accepts[0]?.maxTimeoutSeconds).toBe(120);
    // The tenant's grace policy applies without the merchant restating it.
    expect(pay.rail.grace.enabled).toBe(true);
  });

  it("refuses a wallet the tenant did not configure", async () => {
    stubInfi((call) =>
      call.url.includes("/rail/config")
        ? json({ network: "base", asset: USDC, assetDecimals: 6, payTo: "0xTheirs", extra: {} })
        : json({}),
    );
    await expect(requirePayment(client(), { product: "serp-api", wallet: "0xMine" })).rejects.toThrow(
      /does not match the tenant's configured rail wallet/,
    );
  });

  it("refuses to mount without an EIP-712 domain — no client could sign", async () => {
    await expect(
      requirePayment(client(), {
        product: "serp-api",
        wallet: WALLET,
        settings: { network: "base", asset: USDC, assetDecimals: 6 },
      }),
    ).rejects.toThrow(/EIP-712 domain/);
  });

  it("refuses a route whose meter has no price", async () => {
    stubInfi(() => json({}));
    const pay = await mount();
    expect(() => pay({ meter: "unpriced" })).toThrow(/has no price/);
  });
});

// ── withheld delivery ───────────────────────────────────────────────────────
//
// The market's shape, and the one that decides whether a merchant can be made to
// deliver for free: run the handler into a BUFFER, settle, and flush only if the
// payment landed. What the merchant risks is the compute, never the goods.
//
// Confirmed against the reference implementation: x402's own Go middleware is
// `handlePaymentVerified ... with response capture and settlement`, and thirdweb's
// `settlePayment` runs inside the handler and returns content only after settling.

interface DeliveryResult {
  /** What actually reached the client. */
  body: string;
  status: number;
  headers: Record<string, string>;
}

/**
 * Run the middleware AND a handler, the way Express would: the middleware calls
 * next(), the handler writes, and whatever the adapter decides to flush is what
 * this returns.
 */
function deliver(
  mw: PaymentMiddleware,
  headers: Record<string, string>,
  handler: (res: Record<string, unknown>) => void,
): Promise<DeliveryResult> {
  const req: ExpressRequestLike = {
    method: "GET",
    url: "/v1/search?q=infi",
    originalUrl: "/v1/search?q=infi",
    protocol: "https",
    headers: { host: "api.merchant.com", ...headers },
  };
  const out: Record<string, string> = {};
  let flushed = "";

  return new Promise<DeliveryResult>((resolve) => {
    // Read statusCode at the end rather than tracking it: a handler sets it
    // directly as often as it calls res.status(), and observing only one of the two
    // is how a harness reports 200 for a 500.
    const done = () =>
      resolve({
        body: flushed,
        status: (res as { statusCode: number }).statusCode,
        headers: out,
      });
    const res: Record<string, unknown> = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        out[name] = value;
      },
      status(code: number) {
        (res as { statusCode: number }).statusCode = code;
        return {
          json(body: unknown) {
            flushed = JSON.stringify(body);
            done();
          },
        };
      },
      write(chunk: unknown) {
        flushed += String(chunk);
        return true;
      },
      end(chunk?: unknown) {
        if (chunk !== undefined) flushed += String(chunk);
        done();
      },
    };
    mw(req, res as never, (err?: unknown) => {
      if (err !== undefined) {
        flushed = `next(${String(err)})`;
        done();
        return;
      }
      handler(res);
    });
  });
}

/** Infi verifies, then settles with a real transaction. */
function verifyThenSettle(outcome: Record<string, unknown>): Handler {
  return (call) => {
    if (call.url.endsWith("/rail/verify")) {
      return json({
        isValid: true,
        payer: "0xPayer",
        agent: { id: "agt_1", enrollmentId: "enr_1", address: "0xPayer", network: "base" },
      });
    }
    if (call.url.endsWith("/rail/settle")) return json(outcome);
    return json({});
  };
}

describe("withheld delivery", () => {
  it("flushes the handler's body only after settlement, with the real transaction", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    const pay = await mount();
    const out = await deliver(
      pay({ meter: "searches" }),
      { "x-payment": paymentHeader() },
      (res) => {
        (res.end as (c: string) => void)('{"results":["infi"]}');
      },
    );

    expect(out.status).toBe(200);
    expect(out.body).toBe('{"results":["infi"]}');
    const receipt = decodePaymentResponse(out.headers["X-PAYMENT-RESPONSE"] ?? "");
    expect(receipt.transaction).toBe("0xbeef");
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(true);
  });

  it("WITHHOLDS the body when settlement is refused, and answers 402", async () => {
    stubInfi(verifyThenSettle({ status: "refused", reason: "insufficient_funds" }));
    const pay = await mount();
    const out = await deliver(
      pay({ meter: "searches" }),
      { "x-payment": paymentHeader() },
      (res) => {
        (res.end as (c: string) => void)('{"results":["the merchant would have paid for this"]}');
      },
    );

    expect(out.status).toBe(402);
    expect(out.body).not.toContain("would have paid");
    // Proves the refusal came from SETTLEMENT and not from an earlier gate: without
    // this the test passes for the wrong reason, which is how it first passed with
    // no implementation at all.
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(true);
  });

  it("WITHHOLDS the body when settlement is unknown — it may have landed, but nobody can say so", async () => {
    stubInfi(verifyThenSettle({ status: "unknown" }));
    const pay = await mount();
    const out = await deliver(
      pay({ meter: "searches" }),
      { "x-payment": paymentHeader() },
      (res) => {
        (res.end as (c: string) => void)('{"secret":"x"}');
      },
    );

    expect(out.status).toBe(402);
    expect(out.body).not.toContain("secret");
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(true);
  });

  it("does not settle when the handler itself failed — there is nothing to charge for", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    const pay = await mount();
    const out = await deliver(
      pay({ meter: "searches" }),
      { "x-payment": paymentHeader() },
      (res) => {
        (res as { statusCode: number }).statusCode = 500;
        (res.end as (c: string) => void)('{"error":"upstream exploded"}');
      },
    );

    expect(out.status).toBe(500);
    expect(out.body).toContain("upstream exploded");
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(false);
  });

  it("can be turned off for a streaming route, which cannot be buffered", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    const pay = await mount();
    const out = await deliver(
      pay({ meter: "searches", withholdUntilSettled: false }),
      { "x-payment": paymentHeader() },
      (res) => {
        (res.end as (c: string) => void)("streamed");
      },
    );

    expect(out.body).toBe("streamed");
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(false);
  });
});
