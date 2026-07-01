import { Infi, type UsageEvent } from "@beinfi/sdk";
import { type NextRequest, NextResponse } from "next/server";
import type { UsageOptions } from "./types.js";

interface BatchBody {
  events: UsageEvent[];
}

function isBatch(body: unknown): body is BatchBody {
  return typeof body === "object" && body !== null && Array.isArray((body as BatchBody).events);
}

/**
 * App Router `POST` handler that ingests usage events server-side (single event
 * or `{ events: [...] }`). Server-side only — never ingest from the browser.
 *
 * ```ts
 * // app/api/usage/route.ts
 * export const POST = Usage({ secretKey: process.env.INFI_SECRET_KEY! })
 * ```
 */
export function Usage(options: UsageOptions) {
  const infi = new Infi({ secretKey: options.secretKey, baseUrl: options.baseUrl });

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const body = (await req.json()) as UsageEvent | BatchBody;
    const customerId = await options.resolveCustomerId?.(req);
    const stamp = (event: UsageEvent): UsageEvent =>
      customerId ? { ...event, customerId } : event;

    const result = isBatch(body)
      ? await infi.trackBatch(body.events.map(stamp))
      : await infi.track(stamp(body));

    return NextResponse.json(result);
  };
}
