import { afterEach, describe, expect, it } from "vitest";
import { Infi } from "../client.js";
import { decodePaymentResponse, encodePaymentHeader } from "./header.js";
import { requireMcpPayment, type McpGate } from "./mcp.js";
import type { ExactEvmAuthorization, PaymentRequiredBody } from "./types.js";

const BASE = "https://api.test";
const WALLET = "0xMerchantWallet";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

const verifyOk: Handler = verifyThenSettle({ status: "settled", transaction: "0xbeef" });

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ── the agent side, faked ───────────────────────────────────────────────────

function paymentHeader(over: Partial<ExactEvmAuthorization> = {}): string {
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
    network: "base",
    payload: { signature: `0x${"11".repeat(65)}`, authorization },
  });
}

// ── a fake Streamable HTTP endpoint ─────────────────────────────────────────

/** One JSON-RPC message, as an MCP client would POST it. */
function rpc(method: string, params?: unknown, id: number | string | null = 1) {
  return { jsonrpc: "2.0", ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) };
}

/** A `tools/call` for one tool. */
function callTool(name: string, id: number | string = 1) {
  return rpc("tools/call", { name, arguments: { q: "infi" } }, id);
}

interface RunResult {
  /** true when the gate let the transport run. */
  reached: boolean;
  status: number;
  body: string;
  headers: Record<string, string>;
  infi?: unknown;
  error?: unknown;
  /**
   * Writes that arrived after the response was closed. Node throws
   * `ERR_STREAM_WRITE_AFTER_END` for these; the fake records them instead, because
   * the gate swallows its own async rejections and a throw would vanish. Populated
   * by reference, so it is still filling after the promise resolves.
   */
  violations: string[];
}

/**
 * Drive the gate the way Express would, with a fake MCP transport behind it.
 * `transport` is what the real `StreamableHTTPServerTransport.handleRequest`
 * would write.
 */
function run(
  gate: McpGate,
  body: unknown,
  headers: Record<string, string> = {},
  transport: (res: Record<string, unknown>) => void = (res) => {
    (res.end as (c: string) => void)(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "results" }] } }));
  },
  /** Called when bytes actually reach the socket — the only way to tell a held
   *  response from a streamed one, since both end up with the same content. */
  trace: (event: string) => void = () => {},
  method = "POST",
): Promise<RunResult> {
  const req: Record<string, unknown> = {
    method,
    url: "/mcp",
    originalUrl: "/mcp",
    protocol: "https",
    headers: { host: "api.merchant.com", "content-type": "application/json", ...headers },
    body,
  };
  const out: Record<string, string> = {};
  const violations: string[] = [];
  let written = "";
  let reached = false;
  let closed = false;

  return new Promise<RunResult>((resolve) => {
    const done = () =>
      resolve({
        reached,
        status: (res as { statusCode: number }).statusCode,
        body: written,
        headers: out,
        infi: req.infi,
        violations,
      });
    const res: Record<string, unknown> = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        out[name] = value;
      },
      getHeader(name: string) {
        // Node's own getHeader is case-insensitive, and a fake that is not would
        // pass a gate that the real transport's `Content-Type` walks straight past.
        const key = Object.keys(out).find((k) => k.toLowerCase() === name.toLowerCase());
        return key === undefined ? undefined : out[key];
      },
      status(code: number) {
        if (closed) violations.push(`status(${code}) after end`);
        (res as { statusCode: number }).statusCode = code;
        return {
          json(b: unknown) {
            if (closed) violations.push("json after end");
            written = JSON.stringify(b);
            done();
          },
        };
      },
      write(chunk: unknown) {
        if (closed) violations.push("write after end");
        trace("write");
        written += String(chunk);
        return true;
      },
      end(chunk?: unknown) {
        trace("end");
        if (chunk !== undefined) written += String(chunk);
        closed = true;
        done();
      },
    };
    gate(req as never, res as never, (err?: unknown) => {
      if (err !== undefined) {
        written = `next(${String(err)})`;
        done();
        return;
      }
      reached = true;
      transport(res);
    });
  });
}

function client(): Infi {
  return new Infi({ secretKey: "sk_test_x", apiUrl: BASE });
}

async function mount(overrides: Record<string, unknown> = {}): Promise<McpGate> {
  return requireMcpPayment(client(), {
    product: "serp-api",
    wallet: WALLET,
    settings: SETTINGS,
    tools: {
      search: { meter: "searches" },
      summarize: { meter: "tokens", max: 8000 },
    },
    ...overrides,
  });
}

// ── 1. the handshake is free, or nobody can discover what to pay for ────────

describe("free traffic", () => {
  it.each([
    ["initialize", rpc("initialize", { protocolVersion: "2025-06-18" })],
    ["tools/list", rpc("tools/list")],
    ["ping", rpc("ping")],
    ["a notification", rpc("notifications/initialized", undefined, null)],
    ["resources/read", rpc("resources/read", { uri: "file:///x" })],
  ])("lets %s through without charging", async (_label, message) => {
    stubInfi(() => json({}));
    const out = await run(await mount(), message);

    expect(out.reached).toBe(true);
    // The discovery handshake must cost nothing: an agent that cannot call
    // tools/list cannot learn which tools are paid, or what they cost.
    expect(calls).toHaveLength(0);
  });

  it("lets an UNPRICED tool through — the merchant sells some tools, not all", async () => {
    stubInfi(() => json({}));
    const out = await run(await mount(), callTool("health"));

    expect(out.reached).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

// ── 2. a priced tool with no payment ────────────────────────────────────────

describe("no X-PAYMENT", () => {
  it("answers a transport-level 402 carrying the x402 body", async () => {
    stubInfi(() => json({}));
    const out = await run(await mount(), callTool("search"));

    expect(out.reached).toBe(false);
    expect(out.status).toBe(402);
    const body = JSON.parse(out.body) as PaymentRequiredBody;
    expect(body.x402Version).toBe(1);
    expect(body.error).toBe("X-PAYMENT header is required");
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base",
      maxAmountRequired: "5000",
      description: "Web search, one query",
      payTo: WALLET,
      asset: USDC,
    });
  });

  it("names the TOOL in `resource`, not the endpoint — two tools at one URL are two prices", async () => {
    stubInfi(() => json({}));
    const search = await run(await mount(), callTool("search"));
    const summarize = await run(await mount(), callTool("summarize"));

    const a = (JSON.parse(search.body) as PaymentRequiredBody).accepts[0];
    const b = (JSON.parse(summarize.body) as PaymentRequiredBody).accepts[0];
    expect(a?.resource).toBe("https://api.merchant.com/mcp?tool=search");
    expect(b?.resource).toBe("https://api.merchant.com/mcp?tool=summarize");
    // Same endpoint, different price: 8000 tokens x $0.0001 = $0.80.
    expect(b?.maxAmountRequired).toBe("800000");
  });
});

// ── 3. a priced tool, paid ──────────────────────────────────────────────────

describe("a paid tool call", () => {
  it("verifies against the tool's own meter and quantity, then runs the transport", async () => {
    stubInfi(verifyOk);
    const out = await run(await mount(), callTool("summarize"), { "x-payment": paymentHeader({ value: "800000" }) });

    expect(out.reached).toBe(true);
    const verify = calls.find((c) => c.url.endsWith("/rail/verify"));
    expect(verify?.body).toMatchObject({ product: "serp-api", meter: "tokens", quantity: "8000" });
  });

  it("puts the payment context on the request, so the tool handler can read the payer", async () => {
    stubInfi(verifyOk);
    const out = await run(await mount(), callTool("search"), { "x-payment": paymentHeader() });

    expect((out.infi as { agent: { address: string } }).agent.address).toBe("0xPayer");
  });
});

// ── 4. batching — one header cannot pay for two resources ───────────────────

describe("a JSON-RPC batch", () => {
  it("prices a batch whose ONLY paid call is one tool", async () => {
    stubInfi(verifyOk);
    const out = await run(await mount(), [rpc("ping", undefined, 1), callTool("search", 2)], {
      "x-payment": paymentHeader(),
    });

    expect(out.reached).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/rail/verify"))).toHaveLength(1);
  });

  it("REFUSES a batch with two paid calls: one X-PAYMENT cannot buy two resources", async () => {
    stubInfi(verifyOk);
    const out = await run(await mount(), [callTool("search", 1), callTool("summarize", 2)], {
      "x-payment": paymentHeader(),
    });

    expect(out.reached).toBe(false);
    expect(out.status).toBe(400);
    // Nothing was verified, so no nonce was burned on a request that could not
    // have been priced correctly anyway.
    expect(calls).toHaveLength(0);
  });
});

// ── 5. withheld delivery, MCP-shaped ────────────────────────────────────────

describe("withheld delivery", () => {
  it("flushes the tool result only after settlement, with the real transaction", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    const out = await run(await mount(), callTool("search"), { "x-payment": paymentHeader() });

    expect(out.body).toContain("results");
    expect(decodePaymentResponse(out.headers["X-PAYMENT-RESPONSE"] ?? "").transaction).toBe("0xbeef");
  });

  it("WITHHOLDS the tool result when settlement is refused", async () => {
    stubInfi(verifyThenSettle({ status: "refused", reason: "insufficient_funds" }));
    const out = await run(await mount(), callTool("search"), { "x-payment": paymentHeader() }, (res) => {
      (res.end as (c: string) => void)(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "the goods" }] } }),
      );
    });

    expect(out.status).toBe(402);
    expect(out.body).not.toContain("the goods");
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(true);
  });

  it("does not settle a JSON-RPC ERROR — HTTP 200 is not the same as the tool succeeding", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    const out = await run(await mount(), callTool("search"), { "x-payment": paymentHeader() }, (res) => {
      // MCP answers a failed call with HTTP 200 and a JSON-RPC error. Express's
      // `statusCode >= 400` rule sees success here and would bill the agent for it.
      (res.end as (c: string) => void)(
        JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "invalid params" } }),
      );
    });

    expect(out.body).toContain("invalid params");
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(false);
  });

  it("does not settle a tool that reported isError — same reason, one level down", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    const out = await run(await mount(), callTool("search"), { "x-payment": paymentHeader() }, (res) => {
      (res.end as (c: string) => void)(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { isError: true, content: [{ type: "text", text: "upstream exploded" }] },
        }),
      );
    });

    expect(out.body).toContain("upstream exploded");
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(false);
  });

  it("settles the RIGHT call in a batch, and ignores an error belonging to a free one", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    const out = await run(
      await mount(),
      [rpc("ping", undefined, 1), callTool("search", 2)],
      { "x-payment": paymentHeader() },
      (res) => {
        (res.end as (c: string) => void)(
          JSON.stringify([
            { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "ping failed" } },
            { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "results" }] } },
          ]),
        );
      },
    );

    // The paid call (id 2) succeeded. The free one failing is not the agent's
    // problem and must not cancel a settlement it did not pay for.
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(true);
    expect(out.body).toContain("results");
  });

  it("DEGRADES to deliver-then-settle on SSE — a buffer cannot stream", async () => {
    // Content is the same either way, so content proves nothing. What separates a
    // held response from a streamed one is WHEN the bytes reach the socket: before
    // settlement, or after it.
    const order: string[] = [];
    const settled = verifyThenSettle({ status: "settled", transaction: "0xbeef" });
    stubInfi((call) => {
      if (call.url.endsWith("/rail/settle")) order.push("settle");
      return settled(call);
    });

    const out = await run(
      await mount(),
      callTool("search"),
      { "x-payment": paymentHeader() },
      (res) => {
        // The transport upgrades to SSE to report progress. Holding this would
        // starve the client of every event until the stream closed.
        (res.setHeader as (n: string, v: string) => void)("Content-Type", "text/event-stream");
        (res.write as (c: string) => boolean)(
          'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"results"}]}}\n\n',
        );
        (res.end as (c?: string) => void)();
      },
      (event) => order.push(event),
    );

    expect(out.body).toContain('"results"');
    // Delivered THEN settled. Buffering would put "settle" first.
    expect(order).toEqual(["write", "end", "settle"]);
  });

  it("still settles an SSE call — degrading must not become delivering for free", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    await run(await mount(), callTool("search"), { "x-payment": paymentHeader() }, (res) => {
      (res.setHeader as (n: string, v: string) => void)("Content-Type", "text/event-stream");
      (res.write as (c: string) => boolean)('data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');
      (res.end as (c?: string) => void)();
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(true);
  });

  it("does not settle an SSE call whose tool errored — the frames are still the verdict", async () => {
    stubInfi(verifyThenSettle({ status: "settled", transaction: "0xbeef" }));
    await run(await mount(), callTool("search"), { "x-payment": paymentHeader() }, (res) => {
      (res.setHeader as (n: string, v: string) => void)("Content-Type", "text/event-stream");
      (res.write as (c: string) => boolean)(
        'data: {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"upstream exploded"}}\n\n',
      );
      (res.end as (c?: string) => void)();
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(false);
  });
});

// ── 6. wiring, and the channels that are not work ───────────────────────────

describe("the rest of the transport", () => {
  it.each([["GET"], ["DELETE"]])(
    "lets %s through untouched — the SSE channel and session teardown are not units of work",
    async (method) => {
      stubInfi(() => json({}));
      const out = await run(await mount(), undefined, {}, undefined, undefined, method);

      expect(out.reached).toBe(true);
      expect(calls).toHaveLength(0);
    },
  );

  it("REFUSES to run without a parsed body, rather than serving every paid tool free", async () => {
    stubInfi(() => json({}));
    const out = await run(await mount(), undefined, { "x-payment": paymentHeader() });

    // A gate that cannot see the body cannot see a tool call either. Failing open
    // here is a silent revenue hole; failing loud is a wiring bug you fix once.
    expect(out.reached).toBe(false);
    expect(out.body).toContain("express.json()");
    expect(calls).toHaveLength(0);
  });

  it("cannot un-send an SSE stream, so a refused settlement does NOT become a 402 on top of it", async () => {
    stubInfi(verifyThenSettle({ status: "refused", reason: "insufficient_funds" }));
    const out = await run(await mount(), callTool("search"), { "x-payment": paymentHeader() }, (res) => {
      (res.setHeader as (n: string, v: string) => void)("Content-Type", "text/event-stream");
      (res.write as (c: string) => boolean)(
        'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"results"}]}}\n\n',
      );
      (res.end as (c?: string) => void)();
    });

    await new Promise((r) => setTimeout(r, 10));
    // The bytes are gone. Writing a 402 after the stream closed would corrupt the
    // response the client already read — the loss is recorded, not papered over.
    expect(out.violations).toEqual([]);
    expect(out.status).toBe(200);
    expect(out.body).toContain('"results"');
    expect(calls.some((c) => c.url.endsWith("/rail/settle"))).toBe(true);
  });
});
