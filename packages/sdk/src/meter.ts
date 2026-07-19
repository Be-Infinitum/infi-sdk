/**
 * Token extraction + options for `infi.meter(...)` — the metered-LLM wrapper.
 * Kept pure and framework-free so it is unit-testable without a client.
 */

/**
 * How `meter` treats the credit gate and the usage recording, named by billing
 * intent rather than mechanism:
 *
 * - `"prepaid"` (default) — gate on the wallet balance, then record. The call is
 *   blocked with `InsufficientCreditError` (402) when the customer is out of
 *   credit. Use for prepaid credits / pay-with-balance.
 * - `"postpaid"` — record only, never gate. Usage accrues and is invoiced at
 *   period close (metered API, per-org rate-card). There is no wallet to draw
 *   down, so a gate would wrongly block legitimate usage.
 * - `"streaming"` — gate now, but do NOT record here. Use when the true
 *   usage isn't known until after `fn` resolves (streaming LLM calls, where the
 *   token count only settles once the stream finishes): gate on the way in, then
 *   record the real value yourself with `infi.track(...)` (e.g. in the AI SDK
 *   `onFinish` callback).
 */
export type MeterMode = "prepaid" | "postpaid" | "streaming";

export interface MeterOptions {
  /**
   * The customer this usage is charged to. Prefer the **enrollment id** returned
   * by `products.enroll` — the same id `customers.state` / `credits.balance` key
   * on, and the only id the prepaid credit gate can read. The backend also
   * resolves a customer's external id here (backward compatible), but the gate
   * only works with the enrollment id, so a `"prepaid"`/`"streaming"` meter
   * should pass the enrollment id. See {@link enrollmentId} for an explicit alias.
   */
  customerId?: string;
  /**
   * Explicit alias for {@link customerId}, named for clarity when you hold the
   * enrollment id from `products.enroll`. Takes precedence over `customerId` and
   * resolves to the single id used for BOTH the credit gate and the usage record,
   * so one id keys the same customer on both paths.
   */
  enrollmentId?: string;
  /** Meter name the usage records against (e.g. "tokens"). */
  meter: string;
  /**
   * Product id stamped on the usage event. Required by metering ingest when the
   * tenant has multiple products — same as `infi.session(customerId, productId)`.
   */
  productId?: string;
  /**
   * Gate/record behavior, by billing intent. Default `"prepaid"` (gate + record).
   * See {@link MeterMode}.
   */
  mode?: MeterMode;
  /**
   * Explicit usage value. When set, no extraction runs — use it when you rate
   * something other than the model's own token count (e.g. weighting
   * input/output differently, or metering requests instead of tokens).
   */
  value?: number | string;
  /**
   * Custom extractor from the wrapped call's result. Overrides the built-in
   * OpenAI/Anthropic detection. Return the numeric usage to record.
   */
  extract?: (result: unknown) => number | string;
  /**
   * @deprecated Use `mode: "postpaid"` instead. When true, behaves like
   * `mode: "postpaid"` (record without gating). Ignored when `mode` is set.
   */
  skipGuard?: boolean;
  /** Extra metadata stamped onto the usage event. */
  metadata?: Record<string, unknown>;
}

/** Resolve the effective mode from `mode` (preferred) or the deprecated `skipGuard`. */
export function resolveMeterMode(opts: MeterOptions): MeterMode {
  if (opts.mode) return opts.mode;
  if (opts.skipGuard) return "postpaid";
  return "prepaid";
}

/**
 * Resolve the single customer id used for BOTH the credit gate and the usage
 * record. `enrollmentId` (explicit) wins over `customerId`. Pass the enrollment
 * id from `products.enroll` so the gate and the record key the same customer.
 * Throws when neither is set — usage must never be recorded against no customer.
 */
export function resolveCustomerId(opts: MeterOptions): string {
  const id = opts.enrollmentId ?? opts.customerId;
  if (!id) {
    throw new Error("infi.meter: options.enrollmentId (or customerId) is required.");
  }
  return id;
}

/**
 * Best-effort token count from a common LLM response shape:
 * - OpenAI chat/completions: `usage.total_tokens`
 * - Anthropic messages: `usage.input_tokens + usage.output_tokens`
 * - Vercel AI SDK (generateText): `usage.totalTokens`, or
 *   `usage.promptTokens + usage.completionTokens`
 * Returns undefined when no shape is present.
 *
 * Note: this reads a *resolved* usage object. Streaming calls (AI SDK
 * `streamText`) return before token usage settles — use `mode: "streaming"`
 * and record the real count from the stream's `onFinish` instead.
 */
export function extractTokens(result: unknown): number | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const usage = (result as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return undefined;
  const u = usage as Record<string, unknown>;

  // OpenAI (snake_case) / AI SDK (camelCase) total.
  if (typeof u.total_tokens === "number") return u.total_tokens;
  if (typeof u.totalTokens === "number") return u.totalTokens;

  // Anthropic input/output.
  const input = typeof u.input_tokens === "number" ? u.input_tokens : undefined;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  if (input !== undefined || output !== undefined) return (input ?? 0) + (output ?? 0);

  // AI SDK prompt/completion.
  const prompt = typeof u.promptTokens === "number" ? u.promptTokens : undefined;
  const completion = typeof u.completionTokens === "number" ? u.completionTokens : undefined;
  if (prompt !== undefined || completion !== undefined) return (prompt ?? 0) + (completion ?? 0);

  return undefined;
}

/**
 * Resolve the usage value to record from options + the call result, in order:
 * explicit `value` → custom `extract` → built-in token detection. Throws when
 * none yields a value, so usage is never silently dropped or recorded as zero.
 */
export function resolveUsageValue(opts: MeterOptions, result: unknown): string {
  if (opts.value !== undefined) return String(opts.value);
  const extracted = opts.extract ? opts.extract(result) : extractTokens(result);
  if (extracted === undefined) {
    throw new Error(
      `infi.meter: could not determine usage for meter "${opts.meter}". ` +
        `Pass options.value or options.extract — the result had no recognized token usage.`,
    );
  }
  return String(extracted);
}
