/**
 * Token extraction + options for `infi.meter(...)` — the metered-LLM wrapper.
 * Kept pure and framework-free so it is unit-testable without a client.
 */

export interface MeterOptions {
  /** The customer's external id (charged for the usage). */
  customerId: string;
  /** Meter name the usage records against (e.g. "tokens"). */
  meter: string;
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
   * Skip the pre-flight credit check. Default false (the gate runs). Set true
   * to record usage without blocking (e.g. a free tier that only meters).
   */
  skipGuard?: boolean;
  /** Extra metadata stamped onto the usage event. */
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort token count from a common LLM response shape:
 * - OpenAI chat/completions: `usage.total_tokens`
 * - Anthropic messages: `usage.input_tokens + usage.output_tokens`
 * Returns undefined when neither shape is present.
 */
export function extractTokens(result: unknown): number | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const usage = (result as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return undefined;
  const u = usage as Record<string, unknown>;

  if (typeof u.total_tokens === "number") return u.total_tokens;

  const input = typeof u.input_tokens === "number" ? u.input_tokens : undefined;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  if (input !== undefined || output !== undefined) return (input ?? 0) + (output ?? 0);

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
