/**
 * Withheld delivery: run the handler into a buffer, settle, and flush only if the
 * payment landed.
 *
 * This is the shape the reference implementations use — x402's own Go middleware is
 * `handlePaymentVerified ... with response capture and settlement`, and thirdweb's
 * `settlePayment` runs inside the handler and returns content only after settling.
 * What it protects is specific: the merchant risks the COMPUTE, never the goods. An
 * agent that presents a payment which does not settle makes the handler run for
 * nothing and receives a 402, not the bytes.
 *
 * The trade is latency — an on-chain write sits in the endpoint's response time.
 * That is why it can be turned off per route (`withholdUntilSettled: false`), which
 * a streaming route MUST do: a buffer cannot stream.
 */

/** The parts of an Express response this needs in order to hold it. */
export interface BufferableResponse {
  statusCode?: number;
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
  write?(chunk: unknown, ...rest: unknown[]): boolean;
  end?(chunk?: unknown, ...rest: unknown[]): unknown;
}

/** What settlement said, and therefore whether the buffer may be released. */
export type SettlementVerdict =
  | { release: true; transaction?: string }
  | { release: false; status: number; body: unknown };

type Chunk = { chunk: unknown; rest: unknown[] };

/** What the handler produced, and what may still be done about it. */
export interface HeldResponse {
  /** Send what was held. A no-op once `delivered` — those bytes are already gone. */
  flush: () => void;
  /**
   * The handler failed at the TRANSPORT level (status >= 400). Protocols that
   * report failure inside a 200 body — MCP is one — must also read `body()`.
   */
  failed: boolean;
  /** Everything the handler wrote, concatenated. */
  body: () => string;
  /**
   * The hold was abandoned mid-flight (`passthrough`) and the bytes are already on
   * the wire. Settling is still worth doing; refusing is no longer possible.
   */
  delivered: boolean;
}

export interface WithholdOptions {
  /**
   * Asked once, at the first write: may this response still be held?
   *
   * Returning true abandons the hold — for a response that buffering would BREAK
   * rather than merely delay, like an SSE stream whose whole point is arriving in
   * pieces. The caller then delivers and settles afterwards.
   */
  passthrough?: () => boolean;
}

/**
 * Hold everything the handler writes, and hand it to `onEnd` when the handler is
 * done. `onEnd` decides: `flush()` sends what was held, or it writes its own
 * response instead.
 *
 * A handler that FAILED is flushed without asking: there is nothing to charge for,
 * and settling a request that errored would bill the buyer for an error page. Same
 * rule as the reference — "don't settle if response failed" — except that what
 * counts as failed is the caller's to judge, because only the caller knows whether
 * a 200 means success in its protocol.
 */
export function withholdDelivery(
  res: BufferableResponse,
  onEnd: (held: HeldResponse) => void | Promise<void>,
  opts: WithholdOptions = {},
): boolean {
  const realWrite = res.write?.bind(res);
  const realEnd = res.end?.bind(res);
  if (!realWrite || !realEnd) {
    // Nothing to hold with. Report it and change NOTHING: the caller then delivers
    // immediately, without settling. Settling here would be the worst of both — a
    // charge decided before the handler has produced anything to charge for.
    return false;
  }

  const held: Chunk[] = [];
  let ended = false;
  let delivered = false;
  let asked = false;

  const restore = () => {
    res.write = realWrite;
    res.end = realEnd;
  };

  const flush = () => {
    if (delivered) return;
    for (const { chunk, rest } of held) realWrite(chunk, ...rest);
    realEnd();
  };

  const text = () => held.map(({ chunk }) => String(chunk)).join("");

  res.write = (chunk: unknown, ...rest: unknown[]): boolean => {
    // The one chance to bail out: before anything has been withheld, so nothing
    // has been delayed yet and the stream starts on time.
    if (!asked) {
      asked = true;
      if (opts.passthrough?.()) {
        delivered = true;
        res.write = realWrite;
        // `end` stays wrapped: the caller still has to be told the response is over
        // so it can settle. What it can no longer do is refuse.
      }
    }
    // Recorded even when it is going straight out: `body()` is the only place a
    // protocol-level failure shows, and losing the record means a tool that errored
    // gets billed. Bounded by the call — the long-lived SSE channel is a GET, which
    // is never withheld.
    held.push({ chunk, rest });
    if (delivered) return realWrite(chunk, ...rest);
    return true;
  };

  res.end = (chunk?: unknown, ...rest: unknown[]): unknown => {
    if (ended) return res;
    ended = true;
    const hasChunk = chunk !== undefined && typeof chunk !== "function";
    // The record of what the handler produced is kept either way — `body()` is how
    // a caller judges a failure the status line does not show.
    if (hasChunk) held.push({ chunk, rest });
    const failed = (res.statusCode ?? 200) >= 400;
    // Restore before deciding, so whatever onEnd writes goes to the real socket.
    restore();
    if (delivered) {
      // Already streaming. Close the response for real, THEN report — the client
      // must not wait on a settlement it will never be told about. `flush` is inert
      // from here: these bytes have already gone.
      if (hasChunk) realEnd(chunk, ...rest);
      else realEnd();
      void onEnd({ flush, failed, body: text, delivered: true });
      return res;
    }
    void onEnd({ flush, failed, body: text, delivered: false });
    return res;
  };
  return true;
}
