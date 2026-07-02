import { Infi, InsufficientCreditError } from "@beinfi/sdk";
import { type NextRequest, NextResponse } from "next/server";
import type { MeterRouteOptions } from "./types.js";

/**
 * App Router route wrapper for credit-consuming work (LLM/token calls). It
 * gates the customer's credit, runs your `handler`, records the usage, and
 * returns the handler's data as JSON — the drop-in edge gate for metered APIs.
 *
 * Your handler returns the JSON-serializable result (e.g. the LLM response);
 * `withMeter` extracts the token usage from it (OpenAI/Anthropic shapes, or set
 * `value`/`extract`) and serializes it with `NextResponse.json`. Server-side
 * only — never expose the secret key to the browser.
 *
 * ```ts
 * // app/api/chat/route.ts
 * export const POST = withMeter(
 *   { secretKey: process.env.INFI_SECRET_KEY!, meter: "tokens",
 *     resolveCustomerId: (req) => req.headers.get("x-customer-id") ?? undefined },
 *   async (req) => openai.chat.completions.create({ ... }),
 * );
 * ```
 *
 * When the customer is out of credit the handler never runs and the response is
 * 402 (override with `onInsufficientCredit`) — the enforcement point of ADR
 * 0010.
 */
export function withMeter<T>(
  options: MeterRouteOptions,
  handler: (req: NextRequest) => Promise<T>,
) {
  const infi = new Infi({ secretKey: options.secretKey, baseUrl: options.baseUrl });

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const customerId = await options.resolveCustomerId(req);
    if (!customerId) {
      return (
        options.onMissingCustomer?.(req) ??
        NextResponse.json({ error: "missing_customer", message: "Could not resolve customerId." }, { status: 400 })
      );
    }

    try {
      const data = await infi.meter(
        {
          customerId,
          meter: options.meter,
          value: options.value,
          extract: options.extract,
          skipGuard: options.skipGuard,
          metadata: options.metadata,
        },
        () => handler(req),
      );
      return NextResponse.json(data);
    } catch (error) {
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
