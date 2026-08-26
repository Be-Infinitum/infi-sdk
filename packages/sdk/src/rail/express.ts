/**
 * The Express adapter — thin on purpose.
 *
 * Everything it knows is how to read a header, write a 402 and call `next()`.
 * The decision lives in `core.ts`, so Hono, Fastify or a plain Node handler is
 * the same thirty lines against `RailRoute.decide`.
 *
 * Express is NOT a dependency: the types below are the structural minimum the
 * adapter touches, so nothing is installed and a real `express.Request` still
 * satisfies them.
 */

import { InfiError } from "../errors.js";
import { createRail, type PayOptions, type Rail, type RailClient, type RequirePaymentOptions } from "./core.js";
import type { InfiPaymentContext } from "./types.js";

/** The parts of `express.Request` this adapter reads. */
export interface ExpressRequestLike {
  method: string;
  /** Path with query string, as Express gives it. */
  url: string;
  originalUrl?: string;
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
  get?(name: string): string | undefined;
  /** Set by the middleware once a payment is verified. */
  infi?: InfiPaymentContext;
}

/** The parts of `express.Response` this adapter writes. */
export interface ExpressResponseLike {
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
}

export type ExpressNext = (err?: unknown) => void;

/**
 * A request that has been paid for. Type your handler with this to get
 * `req.infi` without a cast:
 *
 * ```ts
 * app.get("/v1/search", pay({ meter: "searches" }), (req: PaidRequest, res) => {
 *   res.json({ agent: req.infi.agent.address });
 * });
 * ```
 */
export interface PaidRequest extends ExpressRequestLike {
  infi: InfiPaymentContext;
}

/**
 * `req.infi`, typed, from a handler behind `pay(...)`.
 *
 * Express's `Request` has no `infi` on it, so the alternative is a cast at every
 * call site. Throws when the handler is not actually behind the middleware,
 * which is a wiring mistake worth failing on rather than reading `undefined`.
 *
 * ```ts
 * app.get("/v1/search", pay({ meter: "searches" }), (req, res) => {
 *   const { agent, verifiedBy } = paid(req);
 * });
 * ```
 */
export function paid(req: ExpressRequestLike): InfiPaymentContext {
  if (!req.infi) {
    throw new InfiError(
      "rail: req.infi is missing — this handler is not mounted behind pay(...).",
      500,
      "rail_not_paid",
    );
  }
  return req.infi;
}

export type PaymentMiddleware = (
  req: ExpressRequestLike,
  res: ExpressResponseLike,
  next: ExpressNext,
) => void;

/** What `requirePayment` hands back: `pay({ meter })`, plus the mounted rail. */
export interface PayFactory {
  (options: PayOptions): PaymentMiddleware;
  /** The mounted rail — settings, grace ledger, `flushGrace()`. Ops and tests. */
  rail: Rail;
}

function readHeader(req: ExpressRequestLike, name: string): string | undefined {
  const direct = req.get?.(name);
  if (direct !== undefined) return direct;
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function absoluteUrl(req: ExpressRequestLike): string {
  const path = req.originalUrl ?? req.url;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const host = readHeader(req, "host");
  if (!host) return path;
  const proto = req.protocol ?? readHeader(req, "x-forwarded-proto") ?? "https";
  return `${proto}://${host}${path}`;
}

/**
 * Sell your routes to agents, one request at a time.
 *
 * ```ts
 * const pay = await requirePayment(infi, {
 *   product: "serp-api",
 *   wallet: "0xMerchantWallet",
 *   grace: { window: "5m", maxPerAgent: "0.50" },   // per process — see §6
 * });
 *
 * app.get("/v1/search", pay({ meter: "searches" }), handler);
 * app.post("/v1/summarize", pay({ meter: "tokens", max: 8000 }), handler);
 * ```
 *
 * Async because the asset's decimals and the route's price are the backend's to
 * state: guessing either is how a charge comes out wrong by a factor of a
 * million. It resolves once, at boot; the middleware itself never re-reads it.
 *
 * The middleware answers 402 with the x402 `accepts` array when `X-PAYMENT` is
 * absent, verifies it with Infi when it is present, sets `X-PAYMENT-RESPONSE` on
 * the way out, and puts `req.infi` on the request.
 */
export async function requirePayment(
  infi: RailClient,
  options: RequirePaymentOptions,
): Promise<PayFactory> {
  const rail = await createRail(infi, options);
  const factory = ((payOptions: PayOptions): PaymentMiddleware => {
    // Priced at mount: an unpriced meter fails when the app starts, not on the
    // first agent that shows up with money.
    const route = rail.route(payOptions);
    return (req, res, next) => {
      const request = {
        method: req.method,
        url: absoluteUrl(req),
        header: (name: string) => readHeader(req, name),
      };
      route
        .decide(request)
        .then((decision) => {
          if (!decision.release) {
            for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
            res.status(decision.status).json(decision.body);
            return;
          }
          // Set before the handler runs: the receipt has nothing in it that the
          // handler can change, and a header set after the body is a header lost.
          for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
          req.infi = decision.infi;
          next();
        })
        .catch(next);
    };
  }) as PayFactory;
  factory.rail = rail;
  return factory;
}
