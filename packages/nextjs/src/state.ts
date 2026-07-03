import { Infi } from "@beinfi/sdk";
import { type NextRequest, NextResponse } from "next/server";
import type { StateOptions } from "./types.js";

/**
 * App Router `GET` handler that returns the authed customer's state (plan,
 * entitlements, credit summary) — the drop-in `/api/state` route non-Next-
 * agnostic clients (a plain SPA, mobile) poll for gating decisions. Server-side
 * only — never expose the secret key to the browser.
 *
 * ```ts
 * // app/api/state/route.ts
 * export const GET = State({
 *   secretKey: process.env.INFI_SECRET_KEY!,
 *   resolveCustomerId: (req) => req.headers.get("x-customer-id") ?? undefined,
 * })
 * ```
 */
export function State(options: StateOptions) {
  const infi = new Infi({ secretKey: options.secretKey, baseUrl: options.baseUrl });

  return async function GET(req: NextRequest): Promise<NextResponse> {
    const customerId = await options.resolveCustomerId(req);
    if (!customerId) {
      return NextResponse.json(
        { error: "missing_customer", message: "Could not resolve customerId." },
        { status: 400 },
      );
    }
    return NextResponse.json(await infi.customers.state(customerId));
  };
}
