import { Infi, InsufficientCreditError, resolveUsageValue } from "@beinfi/sdk";
import { type NextRequest, NextResponse } from "next/server";
import type { MeterMode, MeterRouteOptions } from "./types.js";

/**
 * Thrown from a `withMeter` handler to short-circuit with a business-error
 * response and record NOTHING. This keeps validation and domain errors from
 * being swallowed as generic 500s (or charged for): the handler decides the
 * status + body, `withMeter` returns them verbatim.
 *
 * ```ts
 * if (!prompt) throw new MeterAbort(422, { error: "prompt_required" });
 * ```
 */
export class MeterAbort extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super("MeterAbort");
    this.name = "MeterAbort";
  }
}

/** Resolve the effective mode from `mode` (preferred) or the deprecated `skipGuard`. */
function effectiveMode(options: { mode?: MeterMode; skipGuard?: boolean }): MeterMode {
  if (options.mode) return options.mode;
  if (options.skipGuard) return "postpaid";
  return "prepaid";
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

/**
 * App Router route wrapper for credit-consuming work (LLM/token calls). It
 * gates the customer's credit, runs your `handler`, records the usage, and
 * returns the handler's data as JSON — the drop-in edge gate for metered APIs.
 *
 * The handler receives the resolved id as `ctx.customerId`. It may return either
 * plain JSON-serializable data (serialized with `NextResponse.json`, usage
 * auto-detected from OpenAI/Anthropic/AI-SDK shapes or `value`/`extract`) or a
 * `Response`/`NextResponse`, which is returned UNCHANGED (e.g. a stream). Server-
 * side only — never expose the secret key to the browser.
 *
 * ```ts
 * // app/api/chat/route.ts
 * export const POST = withMeter(
 *   { secretKey: process.env.INFI_SECRET_KEY!, meter: "tokens",
 *     resolveCustomerId: (req) => req.headers.get("x-customer-id") ?? undefined },
 *   async (req, { customerId }) => openai.chat.completions.create({ ... }),
 * );
 * ```
 *
 * When the customer is out of credit the handler never runs and the response is
 * 402 (override with `onInsufficientCredit`) — the enforcement point of ADR
 * 0010. A `MeterAbort` thrown from the handler returns its body+status and
 * records nothing.
 */
export function withMeter<T>(
  options: MeterRouteOptions,
  handler: (req: NextRequest, ctx: { customerId: string }) => Promise<T>,
) {
  const infi = new Infi({ secretKey: options.secretKey, apiUrl: options.apiUrl });
  const mode = effectiveMode(options);

  return async function POST(req: NextRequest): Promise<NextResponse | Response> {
    const customerId = await options.resolveCustomerId(req);
    if (!customerId) {
      return (
        options.onMissingCustomer?.(req) ??
        NextResponse.json({ error: "missing_customer", message: "Could not resolve customerId." }, { status: 400 })
      );
    }

    try {
      // Gate on the way in (skipped for postpaid), mirroring infi.meter.
      if (mode !== "postpaid") {
        await infi.assertCredit(customerId);
      }

      const result = await handler(req, { customerId });

      // Shared options for value resolution + recording (customerId is required
      // by the SDK's MeterOptions; MeterRouteOptions resolves it per-request).
      const meterOpts = {
        customerId,
        meter: options.meter,
        value: options.value,
        extract: options.extract,
      };

      // Response passthrough: a streamed/opaque Response can't be inspected for
      // token usage, so we return it UNCHANGED and record only when the caller
      // supplied an explicit value/extract AND the status is 2xx. Without
      // value/extract there is nothing to record, so we skip it (auto-detection
      // is impossible here). Plain data keeps the full auto-detect behavior.
      if (isResponse(result)) {
        const ok = result.status >= 200 && result.status < 300;
        const canRecord = options.value !== undefined || options.extract !== undefined;
        if (mode !== "streaming" && ok && canRecord) {
          await infi.track({
            customerId,
            meter: options.meter,
            value: resolveUsageValue(meterOpts, result),
            ...(options.metadata ? { metadata: options.metadata } : {}),
          });
        }
        return result;
      }

      if (mode !== "streaming") {
        await infi.track({
          customerId,
          meter: options.meter,
          value: resolveUsageValue(meterOpts, result),
          ...(options.metadata ? { metadata: options.metadata } : {}),
        });
      }
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof MeterAbort) {
        return NextResponse.json(error.body, { status: error.status });
      }
      if (error instanceof InsufficientCreditError) {
        return (
          options.onInsufficientCredit?.(error, req) ??
          NextResponse.json(
            { error: "insufficient_credit", message: error.message, balance: error.balance },
            { status: 402 },
          )
        );
      }
      throw error;
    }
  };
}
