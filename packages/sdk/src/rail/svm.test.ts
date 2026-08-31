import { afterEach, describe, expect, it } from "vitest";
import { Infi } from "../client.js";
import { requirePayment } from "./express.js";
import type { ExpressRequestLike, PaymentMiddleware } from "./express.js";
import { encodePaymentHeader } from "./header.js";
import { NETWORKS, type PaymentPayload, type PaymentRequiredBody } from "./types.js";

/**
 * The rail on Solana.
 *
 * SVM is not EVM with a different name, and every difference below is a money guard
 * the SDK has to honour or it fails OPEN:
 *
 *  - the payload is a base64 versioned transaction, with no `authorization` object,
 *    so there is no `to`, no `value` and no `validBefore` to check locally;
 *  - therefore the PAYER is unknown until the facilitator answers, which is what
 *    makes grace unavailable — grace spends an allowance against an address, and
 *    there is no address to spend it against;
 *  - and there is no EIP-712 domain, so requiring one at mount would make Solana
 *    unmountable.
 *
 * Mirrors `internal/rail/svm.go` and its stories.
 */

const BASE = "https://api.test";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
/** USDC on Solana mainnet. A MINT, not a contract address. */
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SOLANA_SETTINGS = {
  network: NETWORKS.solana,
  asset: USDC_MINT,
  assetDecimals: 6,
  // No `extra`. SVM has no EIP-712 domain, and inventing one would be a lie on the
  // wire that no Solana client knows what to do with.
  meters: { searches: { unitAmount: "0.005", description: "Web search, one query" } },
};

interface Call {
  url: string;
  body: Record<string, unknown>;
}
type Handler = (call: Call) => Response | Error;

const realFetch = globalThis.fetch;
let calls: Call[] = [];

function stubInfi(handler: Handler): void {
  calls = [];
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    };
    calls.push(call);
    const reply = handler(call);
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * What a Solana payer sends: a base64 versioned transaction, partially signed, with
 * the facilitator as fee payer. Opaque to us on purpose.
 */
function svmHeader(transaction = "AQABAgMEBQ...base64-versioned-transaction", network: string = NETWORKS.solana): string {
  return encodePaymentHeader({
    x402Version: 1,
    scheme: "exact",
    network,
    payload: { transaction },
  } as PaymentPayload);
}

interface RunResult {
  released: boolean;
  status: number;
  body: PaymentRequiredBody;
}

function run(mw: PaymentMiddleware, headers: Record<string, string> = {}): Promise<RunResult> {
  const req: ExpressRequestLike = {
    method: "GET",
    url: "/v1/search?q=infi",
    originalUrl: "/v1/search?q=infi",
    protocol: "https",
    headers: { host: "api.merchant.com", ...headers },
  };
  let status = 200;
  return new Promise<RunResult>((resolve) => {
    const res = {
      setHeader() {},
      status(code: number) {
        status = code;
        return {
          json(body: unknown) {
            resolve({ released: false, status, body: body as PaymentRequiredBody });
          },
        };
      },
    };
    mw(req, res as never, () => resolve({ released: true, status, body: {} as PaymentRequiredBody }));
  });
}

function client(): Infi {
  return new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
}

function mount(overrides: Record<string, unknown> = {}) {
  return requirePayment(client(), {
    product: "serp-api",
    wallet: WALLET,
    settings: SOLANA_SETTINGS,
    ...overrides,
  });
}

// ── 1. the vocabulary ───────────────────────────────────────────────────────

describe("network identifiers", () => {
  it("are CAIP-2, mirroring internal/rail/network.go verbatim", () => {
    // A typo in a genesis reference is unrecoverable: it names a chain that does not
    // exist, every payment is refused, and nothing in the error says why. Copied from
    // the backend's constants, and pinned here so a drift is a failing test.
    expect(NETWORKS).toEqual({
      base: "eip155:8453",
      baseSepolia: "eip155:84532",
      solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      solanaDevnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    });
  });
});

// ── 2. mounting ─────────────────────────────────────────────────────────────

describe("mounting on Solana", () => {
  it("does NOT require an EIP-712 domain — SVM has none", async () => {
    stubInfi(() => json({}));
    await expect(mount()).resolves.toBeDefined();
  });

  it("still requires one on EVM, where a client cannot sign without it", async () => {
    stubInfi(() => json({}));
    await expect(
      mount({
        settings: { ...SOLANA_SETTINGS, network: NETWORKS.base, asset: "0x8335…" },
      }),
    ).rejects.toMatchObject({ code: "rail_missing_eip712_domain" });
  });
});

// ── 3. the 402 ──────────────────────────────────────────────────────────────

describe("the 402 on Solana", () => {
  it("quotes the MINT and omits `extra`", async () => {
    stubInfi(() => json({}));
    const out = await run((await mount())({ meter: "searches" }));

    expect(out.status).toBe(402);
    const accept = out.body.accepts[0];
    expect(accept?.network).toBe(NETWORKS.solana);
    expect(accept?.asset).toBe(USDC_MINT);
    expect(accept?.payTo).toBe(WALLET);
    // 0.005 USDC at six decimals, same arithmetic as EVM.
    expect(accept?.maxAmountRequired).toBe("5000");
    expect(accept?.extra).toBeUndefined();
  });
});

// ── 4. the payload we cannot read ───────────────────────────────────────────

describe("an SVM payment", () => {
  it("reaches /verify VERBATIM — a shape we cannot parse must not be refused locally", async () => {
    stubInfi((call) =>
      call.url.endsWith("/rail/verify")
        ? json({ isValid: true, payer: WALLET, agent: { address: WALLET, network: NETWORKS.solana } })
        : json({}),
    );
    const header = svmHeader();
    const out = await run((await mount())({ meter: "searches" }), { "x-payment": header });

    expect(out.released).toBe(true);
    const verify = calls.find((c) => c.url.endsWith("/rail/verify"));
    // The header is replayed at settlement, so a rebuilt payload is a different
    // payload — it has to go through untouched.
    expect(verify?.body.payment).toBe(header);
    expect((verify?.body.paymentPayload as PaymentPayload).payload).toEqual({
      transaction: "AQABAgMEBQ...base64-versioned-transaction",
    });
  });

  it("is still refused when it names a different network than the route", async () => {
    stubInfi(() => json({}));
    const out = await run((await mount())({ meter: "searches" }), {
      "x-payment": svmHeader("AQAB...", NETWORKS.solanaDevnet),
    });

    expect(out.released).toBe(false);
    expect(out.body.error).toBe("invalid_payment");
    // Refused before /verify: nothing to ask about a payment for another chain.
    expect(calls).toHaveLength(0);
  });
});

// ── 5. grace, which cannot exist here ───────────────────────────────────────

describe("grace on Solana", () => {
  it("is REFUSED even when enabled and funded — there is no payer to spend against", async () => {
    // Infi unreachable. On EVM this would spend the allowance and serve; here the
    // payer is unknown until the facilitator answers, so serving would be releasing
    // an unverified payment against an address we cannot name. Fail closed.
    stubInfi(() => new TypeError("fetch failed"));
    const pay = await requirePayment(client(), {
      product: "serp-api",
      wallet: WALLET,
      settings: SOLANA_SETTINGS,
      grace: { window: "5m", maxPerAgent: "10.00" },
    });
    const out = await run(pay({ meter: "searches" }), { "x-payment": svmHeader() });

    expect(out.released).toBe(false);
    expect(out.status).toBe(402);
    expect(out.body.error).toBe("verification_unavailable");
  });

  it("leaves the allowance untouched, so an outage cannot drain it invisibly", async () => {
    stubInfi(() => new TypeError("fetch failed"));
    const pay = await requirePayment(client(), {
      product: "serp-api",
      wallet: WALLET,
      settings: SOLANA_SETTINGS,
      grace: { window: "5m", maxPerAgent: "10.00" },
    });
    await run(pay({ meter: "searches" }), { "x-payment": svmHeader() });

    expect(pay.rail.grace.pending).toBe(0);
  });
});
