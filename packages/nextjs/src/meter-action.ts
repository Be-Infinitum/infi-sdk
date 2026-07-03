import { Infi } from "@beinfi/sdk";
import type { GuardCreditOptions, MeterActionOptions } from "./types.js";

/**
 * Wrap a Server Action in the same credit gate + usage recording as `withMeter`,
 * but for the non-route world: it returns the action's plain result `R` (never a
 * `NextResponse`), so it composes with `useActionState`, `<form action>`, and
 * direct calls.
 *
 * Server Actions have no `NextRequest`, so the customer id is passed directly —
 * the caller resolves it from the session before invoking. Behavior follows
 * `mode` (default `"prepaid"`: gate then record; `"postpaid"`: record only;
 * `"streaming"`: gate only). On an exhausted wallet the underlying
 * `infi.meter` throws `InsufficientCreditError` (402), which is left to
 * PROPAGATE — the action's caller maps it to UI (an upsell, a toast, a redirect).
 *
 * ```ts
 * // app/actions.ts
 * "use server";
 * export const summarize = meterAction(
 *   { secretKey: process.env.INFI_SECRET_KEY!, meter: "tokens", customerId },
 *   async (text: string) => openai.chat.completions.create({ ... }),
 * );
 * ```
 */
export function meterAction<Args extends unknown[], R>(
  options: MeterActionOptions,
  actionFn: (...args: Args) => Promise<R>,
) {
  const infi = new Infi({ secretKey: options.secretKey, baseUrl: options.baseUrl });

  return async function runAction(...args: Args): Promise<R> {
    // infi.meter gates (unless postpaid), runs the action, records usage from
    // its return (value/extract or auto-detect), and returns R unchanged.
    return infi.meter(
      {
        customerId: options.customerId,
        meter: options.meter,
        mode: options.mode,
        value: options.value,
        extract: options.extract,
        metadata: options.metadata,
      },
      () => actionFn(...args),
    );
  };
}

/**
 * A bare credit gate for the top of any Server Action — throws
 * `InsufficientCreditError` (402) when the customer's balance is `<= 0`, does
 * nothing otherwise. Use when the action isn't a single metered call but still
 * must be behind the wallet (multi-step flows, side effects you record yourself).
 *
 * ```ts
 * "use server";
 * export async function generate(input: string) {
 *   await guardCredit({ secretKey: process.env.INFI_SECRET_KEY!, customerId });
 *   // ... do the work, record usage with infi.track(...)
 * }
 * ```
 */
export function guardCredit(options: GuardCreditOptions): Promise<void> {
  return new Infi({ secretKey: options.secretKey, baseUrl: options.baseUrl }).assertCredit(
    options.customerId,
  );
}
