import type { IngestResult, UsageEvent } from "./types.js";

/**
 * Accumulate usage events for one customer and flush them in a single batch —
 * sugar over `infi.trackBatch`. Use it to record several meters across an
 * AI-agent turn, then send them once:
 *
 * ```ts
 * const s = infi.session(customerId);
 * s.track("tokens", result.usage.totalTokens).track("requests", 1);
 * await s.flush();
 * ```
 */
export class MeteringSession {
  #events: UsageEvent[] = [];

  constructor(
    private readonly flushFn: (events: UsageEvent[]) => Promise<IngestResult>,
    private readonly customerId: string,
    private readonly productId?: string,
  ) {}

  /** Queue one usage event (by meter name). Chainable. */
  track(meter: string, value: number | string, metadata?: Record<string, unknown>): this {
    this.#events.push({
      customerId: this.customerId,
      ...(this.productId ? { productId: this.productId } : {}),
      meter,
      value: String(value),
      ...(metadata ? { metadata } : {}),
    });
    return this;
  }

  /** Number of queued events not yet flushed. */
  get size(): number {
    return this.#events.length;
  }

  /** Send all queued events as one batch and clear the queue. No-op when empty. */
  async flush(): Promise<IngestResult | null> {
    if (this.#events.length === 0) return null;
    const batch = this.#events;
    this.#events = [];
    return this.flushFn(batch);
  }
}
