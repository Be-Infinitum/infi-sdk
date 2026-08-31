/**
 * The rail design's §8 example, verbatim, compiled and run.
 *
 * If this file stops type-checking, the API drifted from the spec — fix the API
 * or change the spec on purpose, never quietly.
 */
import { describe, expect, it } from "vitest";
import { Infi } from "../client.js";
import { paid, requirePayment } from "./express.js";
import type { ExpressNext, ExpressRequestLike, ExpressResponseLike } from "./express.js";

const WALLET = "0xMerchantWallet";
const realFetch = globalThis.fetch;

/** Just enough Express to mount middleware on and call it. */
type Handler = (req: ExpressRequestLike, res: ExpressResponseLike, next: ExpressNext) => void;

function fakeApp() {
  const routes = new Map<string, Handler[]>();
  return {
    get: (path: string, ...handlers: Handler[]) => routes.set(`GET ${path}`, handlers),
    post: (path: string, ...handlers: Handler[]) => routes.set(`POST ${path}`, handlers),
    async call(key: string, header?: string): Promise<{ status: number; body: unknown }> {
      const handlers = routes.get(key) ?? [];
      const [method = "GET", path = "/"] = key.split(" ");
      const req: ExpressRequestLike = {
        method,
        url: path,
        headers: { host: "api.merchant.com", ...(header ? { "x-payment": header } : {}) },
        protocol: "https",
      };
      let status = 200;
      let body: unknown;
      // A middleware either sends a response or calls next(); the loop has to
      // wake on whichever happened.
      let sent: () => void = () => undefined;
      const res: ExpressResponseLike = {
        setHeader: () => undefined,
        status: (code: number) => {
          status = code;
          return {
            json: (b: unknown) => {
              body = b;
              sent();
              return undefined;
            },
          };
        },
      };
      for (const handler of handlers) {
        const outcome = await new Promise<"next" | "sent">((resolve, reject) => {
          sent = () => resolve("sent");
          handler(req, res, (err?: unknown) => (err ? reject(err) : resolve("next")));
        });
        if (outcome === "sent") break;
      }
      return { status, body };
    },
  };
}

describe("rail design §8", () => {
  it("compiles and runs exactly as written", async () => {
    globalThis.fetch = (async (input: unknown) =>
      String(input).includes("/rail/config")
        ? new Response(
            JSON.stringify({
              network: "base",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              assetDecimals: 6,
              payTo: WALLET,
              extra: { name: "USDC", version: "2" },
              meters: {
                searches: { unitAmount: "0.005", description: "Web search, one query" },
                tokens: { unitAmount: "0.0001" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        : new Response("{}", { status: 200 })) as typeof fetch;

    const infi = new Infi({ secretKey: "sk_test_x", apiUrl: "https://api.test" });
    const app = fakeApp();
    const handler: Handler = (req, res) => {
      // `req.infi` carries { agent, authorization, settle(), verifiedBy }.
      const { agent, verifiedBy } = paid(req);
      res.status(200).json({ agent: agent.address, via: verifiedBy });
    };

    // ── §8, verbatim ────────────────────────────────────────────────────────
    const pay = await requirePayment(infi, {
      product: "serp-api",
      wallet: "0xMerchantWallet",
      grace: { window: "5m", maxPerAgent: "0.50" }, // per process — see §6
    });

    app.get("/v1/search", pay({ meter: "searches" }), handler);
    app.post("/v1/summarize", pay({ meter: "tokens", max: 8000 }), handler);
    // ── end ─────────────────────────────────────────────────────────────────

    const unpaid = await app.call("GET /v1/search");
    expect(unpaid.status).toBe(402);
    expect(unpaid.body).toMatchObject({
      x402Version: 1,
      accepts: [{ scheme: "exact", maxAmountRequired: "5000", payTo: WALLET }],
    });

    const summarize = await app.call("POST /v1/summarize");
    expect(summarize.body).toMatchObject({ accepts: [{ maxAmountRequired: "800000" }] });

    globalThis.fetch = realFetch;
  });
});
