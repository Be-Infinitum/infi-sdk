/**
 * The MCP adapter — the same rail, over Streamable HTTP.
 *
 * The argument for it is that there is nothing new underneath: an MCP tool call is
 * an HTTP POST with a request/response envelope, which is exactly the shape a 402
 * fits into. So the backend is untouched, `core.ts` is untouched, and this file is
 * the thin translation — read the JSON-RPC body, work out which tool is being
 * called, and hand `RailRoute.decide` the same three fields Express hands it.
 *
 * Three things are genuinely different from HTTP, and each one is a money guard:
 *
 * 1. **Every tool lives at one URL.** `resource` has to name the tool, or two tools
 *    at two prices are the same signed resource.
 * 2. **A failed tool call is HTTP 200.** MCP reports failure inside the body, as a
 *    JSON-RPC `error` or `result.isError`. Express's `statusCode >= 400` rule sees
 *    success and would bill the agent for an error.
 * 3. **The handshake must be free.** An agent that cannot call `initialize` and
 *    `tools/list` cannot discover which tools are paid or what they cost.
 *
 * stdio is NOT here. It has no envelope to put a 402 in, so the refusal has to
 * become a tool error carrying the requirements in its payload — a different shape,
 * deliberately built second.
 *
 * SELLER SIDE ONLY, like the rest of `@beinfi/sdk/rail`: no wallet, no key.
 */

import { InfiError } from "../errors.js";
import {
  createRail,
  type PayOptions,
  type Rail,
  type RailClient,
  type RailRoute,
  type RequirePaymentOptions,
} from "./core.js";
import {
  absoluteUrl,
  readHeader,
  type ExpressNext,
  type ExpressRequestLike,
  type ExpressResponseLike,
} from "./express.js";
import { withholdDelivery } from "./withhold.js";

/** JSON-RPC over MCP, in the parts this needs to read. */
interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; [key: string]: unknown };
  result?: { isError?: boolean; [key: string]: unknown };
  error?: unknown;
}

/**
 * The response, plus `getHeader` — needed to notice the transport upgrading to SSE
 * while output is being withheld.
 */
export interface McpResponseLike extends ExpressResponseLike {
  getHeader?(name: string): unknown;
}

/** The request, plus the parsed JSON-RPC body Express (or the merchant) supplies. */
export interface McpRequestLike extends ExpressRequestLike {
  /** `express.json()` output — the same value handed to `transport.handleRequest`. */
  body?: unknown;
}

export interface McpPaymentOptions extends RequirePaymentOptions {
  /**
   * Tool name -> what it costs. A tool absent from this map is FREE: a merchant
   * sells some tools, not all, and the free ones are how an agent finds the rest.
   */
  tools: Record<string, PayOptions>;
}

export interface McpGate {
  (req: McpRequestLike, res: McpResponseLike, next: ExpressNext): void;
  /** The mounted rail — settings, grace ledger, `flushGrace()`. Ops and tests. */
  rail: Rail;
}

/** Methods that carry a payable unit of work. Everything else rides free. */
const PAID_METHOD = "tools/call";

function messages(body: unknown): JsonRpcMessage[] {
  if (Array.isArray(body)) return body as JsonRpcMessage[];
  if (body && typeof body === "object") return [body as JsonRpcMessage];
  return [];
}

/**
 * `resource` must identify the TOOL, because the endpoint cannot.
 *
 * A query parameter rather than a fragment: the resource is a flat URL string the
 * payer signs and the Bazaar indexes, and a fragment is the one part of a URL that
 * conventionally never reaches a server — an identifier that looks deliberately
 * unaddressable reads as a mistake. Overridable per tool with `PayOptions.resource`.
 */
function toolResource(req: McpRequestLike, tool: string): string {
  const base = absoluteUrl(req);
  try {
    const url = new URL(base);
    url.searchParams.set("tool", tool);
    return url.toString();
  } catch {
    // A relative path, because the request carried no host. Left relative on
    // purpose: inventing a host would put a wrong one into what gets signed.
    return `${base}${base.includes("?") ? "&" : "?"}tool=${encodeURIComponent(tool)}`;
  }
}

/** Every JSON-RPC message in a response body, whether it came back as JSON or SSE. */
function responseMessages(raw: string): JsonRpcMessage[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    return messages(JSON.parse(trimmed));
  } catch {
    // Not JSON, so it is an SSE stream: the payloads are the `data:` lines.
    const out: JsonRpcMessage[] = [];
    for (const line of trimmed.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        out.push(...messages(JSON.parse(line.slice(5).trim())));
      } catch {
        // A partial or non-JSON frame. Nothing to judge, so judge nothing.
      }
    }
    return out;
  }
}

/**
 * Did the call the agent PAID FOR fail?
 *
 * Matched by id, so an unrelated failure in a batch — a free `ping` that errored —
 * cannot cancel a settlement it has nothing to do with.
 *
 * When the answer cannot be found, this says false, and that is a choice with a
 * cost either way. Saying true would withhold a response that is probably fine and
 * hand a 402 to an agent that paid correctly and burned its nonce; saying false
 * risks charging for an error we could not read. The second is recoverable by the
 * merchant, the first is not recoverable by the agent.
 */
function paidCallFailed(raw: string, id: JsonRpcMessage["id"]): boolean {
  const answer = responseMessages(raw).find((m) => m.id === id);
  if (!answer) return false;
  return answer.error !== undefined || answer.result?.isError === true;
}

/**
 * Sell MCP tools to agents, one call at a time.
 *
 * ```ts
 * const gate = await requireMcpPayment(infi, {
 *   product: "serp-api",
 *   wallet: "0xMerchantWallet",
 *   tools: {
 *     search:    { meter: "searches" },
 *     summarize: { meter: "tokens", max: 8000 },
 *   },
 * });
 *
 * app.post("/mcp", express.json(), gate, (req, res) =>
 *   transport.handleRequest(req, res, req.body),
 * );
 * ```
 *
 * Mount it BEFORE the transport. It answers 402 with the x402 `accepts` array when
 * a paid tool arrives without `X-PAYMENT`, verifies it with Infi when it is
 * present, and holds the tool's result until the payment settles.
 */
export async function requireMcpPayment(
  infi: RailClient,
  options: McpPaymentOptions,
): Promise<McpGate> {
  const rail = await createRail(infi, options);
  // Priced at mount: an unpriced meter fails when the server starts, not on the
  // first agent that shows up with money.
  const routes = new Map<string, { route: RailRoute; opts: PayOptions }>();
  for (const [tool, opts] of Object.entries(options.tools)) {
    routes.set(tool, { route: rail.route(opts), opts });
  }

  const gate = ((req: McpRequestLike, res: McpResponseLike, next: ExpressNext): void => {
    // GET opens the server's SSE channel and DELETE ends the session. Neither is a
    // unit of work, and charging for either would break the transport.
    if (req.method.toUpperCase() !== "POST") return next();

    if (req.body === undefined) {
      // Failing loud rather than open. A gate that cannot see the body cannot see a
      // tool call either, and would silently serve every paid tool for free.
      return next(
        new InfiError(
          "rail: req.body is missing — mount express.json() (or your framework's body parser) BEFORE the MCP gate.",
          500,
          "rail_mcp_body_missing",
        ),
      );
    }

    const paid = messages(req.body)
      .filter((m) => m.method === PAID_METHOD)
      .map((m) => ({ message: m, entry: routes.get(String(m.params?.name ?? "")) }))
      .filter((m): m is { message: JsonRpcMessage; entry: { route: RailRoute; opts: PayOptions } } =>
        m.entry !== undefined,
      );

    if (paid.length === 0) return next();

    if (paid.length > 1) {
      // One `X-PAYMENT` header authorizes one resource for one amount. A batch with
      // two paid calls cannot be priced without either overcharging for one or
      // giving the other away, so it is refused BEFORE /verify — the agent still
      // holds its nonce and can re-send the calls one at a time.
      res.setHeader("Content-Type", "application/json");
      res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message:
            "rail: a batch may contain at most one paid tool call — one X-PAYMENT authorizes one resource.",
          data: { tools: paid.map((p) => String(p.message.params?.name)) },
        },
      });
      return;
    }

    const { message, entry } = paid[0]!;
    const request = {
      method: req.method,
      url: toolResource(req, String(message.params?.name)),
      header: (name: string) => readHeader(req, name),
    };

    entry.route
      .decide(request)
      .then((decision) => {
        if (!decision.release) {
          for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
          res.status(decision.status).json(decision.body);
          return;
        }
        req.infi = decision.infi;

        if (entry.opts.withholdUntilSettled === false) {
          for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
          next();
          return;
        }

        const held = withholdDelivery(
          res,
          async ({ flush, failed, body, delivered }) => {
            if (failed || paidCallFailed(body(), message.id)) {
              // The tool itself failed. Nothing to charge for — and unlike HTTP,
              // that verdict is in the body, not the status line.
              flush();
              return;
            }
            const after = await entry.route.settleNow(decision.infi, decision.requirements);
            for (const [k, v] of Object.entries(after.headers)) res.setHeader(k, v);
            if (after.release || delivered) {
              // `delivered` means the bytes are already on the wire (SSE): settling
              // is still worth doing, refusing no longer is.
              flush();
              return;
            }
            res.status(after.status).json(after.body);
          },
          {
            // A tool that reports progress makes the transport answer in SSE, and
            // holding that starves the client of every event until the stream ends
            // — buffering would BREAK it, not merely delay it. Deliver, settle after.
            passthrough: () =>
              String(res.getHeader?.("content-type") ?? "").includes("text/event-stream"),
          },
        );
        if (!held) {
          for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
        }
        next();
      })
      .catch(next);
  }) as McpGate;
  gate.rail = rail;
  return gate;
}
