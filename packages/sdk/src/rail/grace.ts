/**
 * Grace — the bound on Infi's availability sitting inside the merchant's request
 * path (rail design §6).
 *
 * The rule, and it is the part most likely to be got wrong: an allowance is
 * spent ONLY while Infi is unreachable, it is capped, and when it runs out the
 * request is REFUSED with 402 `verification_unavailable`. Never fail open
 * silently. A merchant who wants to serve for free can catch the 402 themselves;
 * a middleware that decides that for them is giving away their product during
 * someone else's outage.
 *
 * Two limits stated rather than discovered:
 *
 *  - **The allowance is per process.** Nothing is shared between instances, so an
 *    agent's true grace exposure is `maxPerAgent x instances`. Making it global
 *    needs shared state, which is the dependency grace exists to avoid.
 *  - **Local verification cannot see exposure.** During grace an agent can exceed
 *    `max_exposure`, bounded by the allowance. That is the trade.
 *
 * And one this file adds, because the spec does not name it: the payer address
 * comes out of an unverified payload, so a forged `from` mints a fresh per-agent
 * bucket. `maxPerAgent` alone bounds nothing against a hostile client — set
 * `maxTotal` for the bound that holds.
 */

import { compareDecimal, normalizeDecimal, subtractDecimalClamped, isZeroDecimal } from "./amount.js";
import { InfiError } from "../errors.js";
import type { PaymentPayload, PaymentRequirements } from "./types.js";

/** A payload released on grace, waiting to be replayed to `/verify`. */
export interface QueuedPayment {
  /** The `X-PAYMENT` header verbatim. */
  payment: string;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  product: string;
  meter: string;
  quantity: string;
  network: string;
  payer: string;
  nonce: string;
  releasedAt: number;
}

export interface GraceOptions {
  /**
   * How long one allowance lasts: `"5m"`, `"90s"`, or milliseconds. The bucket
   * resets when it expires — this is the window from `rail_settings`, and the
   * agent gets a fresh allowance in the next one.
   */
  window?: string | number;
  /** Most one agent may be served for, unverified, per window. Decimal string. */
  maxPerAgent?: string;
  /**
   * Most this PROCESS may serve for, unverified, per window, across all agents.
   * The only bound that survives a forged payer address. Unset means unbounded,
   * which is the spec's shape and not a good default for a hostile internet.
   */
  maxTotal?: string;
  /** Distinct agents tracked before the oldest is evicted. Memory bound, default 5000. */
  maxAgents?: number;
  /** Payloads held for replay before the oldest is dropped. Default 1000. */
  queueLimit?: number;
  /** Clock skew tolerated on `validAfter` / `validBefore`, in seconds. Default 5. */
  clockSkewSeconds?: number;
  /**
   * Verify the payload's signature locally during an outage.
   *
   * The SDK ships no cryptography and no chain access — that is why `/verify`
   * delegates to a facilitator (§3.2) — so by default grace checks the
   * authorization's SHAPE, RECIPIENT, AMOUNT and VALIDITY WINDOW, and not the
   * signature. Supply this (viem's `verifyTypedData`, say) to close that gap.
   * It must never need a private key: this is the seller side.
   */
  verifySignature?(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): boolean | Promise<boolean>;
}

export interface ResolvedGrace {
  windowMs: number;
  maxPerAgent: string;
  maxTotal?: string;
  maxAgents: number;
  queueLimit: number;
  clockSkewSeconds: number;
  verifySignature?: GraceOptions["verifySignature"];
}

const DURATION = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/;

/** `"5m"` -> 300000. A bare number is already milliseconds. */
export function parseDuration(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new InfiError(`rail: invalid duration ${value}`, 400, "rail_invalid_duration");
    }
    return value;
  }
  const m = DURATION.exec(value.trim());
  if (!m) {
    throw new InfiError(
      `rail: invalid duration ${JSON.stringify(value)} — use "500ms", "90s", "5m" or "1h"`,
      400,
      "rail_invalid_duration",
    );
  }
  const n = Number(m[1]);
  const unit = m[2] as "ms" | "s" | "m" | "h";
  const factor = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
  return n * factor;
}

/**
 * Resolve the grace policy. `false`, or a zero allowance, disables grace — and
 * disabled is the fallback when nothing is configured anywhere, because failing
 * closed is the honest default for an allowance nobody chose.
 */
export function resolveGrace(
  option: GraceOptions | false | undefined,
  fromBackend: { window?: string; maxPerAgent?: string; maxTotal?: string } | undefined,
): ResolvedGrace | null {
  if (option === false) return null;
  const maxPerAgent = option?.maxPerAgent ?? fromBackend?.maxPerAgent;
  if (maxPerAgent === undefined || isZeroDecimal(maxPerAgent)) return null;
  const window = option?.window ?? fromBackend?.window ?? "5m";
  // maxTotal falls back to the tenant's, exactly like the other two. It is the
  // only cap that binds against a hostile client — during grace the payer address
  // is unverified, so a caller forges a fresh address per request and mints a
  // fresh per-agent bucket each time. Taking it only from the local option left a
  // merchant who did not repeat the number bounded by nothing.
  const maxTotal = option?.maxTotal ?? fromBackend?.maxTotal;
  return {
    windowMs: parseDuration(window),
    maxPerAgent: normalizeDecimal(maxPerAgent),
    ...(maxTotal !== undefined ? { maxTotal: normalizeDecimal(maxTotal) } : {}),
    maxAgents: option?.maxAgents ?? 5000,
    queueLimit: option?.queueLimit ?? 1000,
    clockSkewSeconds: option?.clockSkewSeconds ?? 5,
    ...(option?.verifySignature ? { verifySignature: option.verifySignature } : {}),
  };
}

interface Bucket {
  remaining: string;
  expiresAt: number;
}

/** Why a grace spend was refused, for the merchant's logs. */
export type GraceRefusal = "disabled" | "agent_allowance_exhausted" | "process_allowance_exhausted";

export type GraceSpend =
  | { ok: true; remaining: string }
  | { ok: false; reason: GraceRefusal };

/**
 * Per-process allowance ledger, replay guard and replay queue.
 *
 * In memory, deliberately: the whole point of grace is to keep serving when the
 * network is not answering, so it cannot depend on anything over a socket.
 */
export class GraceLedger {
  readonly policy: ResolvedGrace | null;
  readonly #agents = new Map<string, Bucket>();
  readonly #nonces = new Set<string>();
  #total: Bucket | null = null;
  #queue: QueuedPayment[] = [];
  #dropped = 0;
  readonly #now: () => number;

  constructor(policy: ResolvedGrace | null, now: () => number = Date.now) {
    this.policy = policy;
    this.#now = now;
  }

  get enabled(): boolean {
    return this.policy !== null;
  }

  /** What this agent may still be served for in the current window. */
  remainingFor(address: string): string {
    if (!this.policy) return "0";
    return this.#bucket(address).remaining;
  }

  /** What this PROCESS may still serve for, or `undefined` when unbounded. */
  remainingTotal(): string | undefined {
    if (!this.policy?.maxTotal) return undefined;
    return this.#totalBucket(this.policy.maxTotal).remaining;
  }

  /**
   * Debit `amount` (the authorization's decimal value) from the agent's
   * allowance and the process total. Refuses rather than going negative.
   */
  spend(address: string, amount: string): GraceSpend {
    const policy = this.policy;
    if (!policy) return { ok: false, reason: "disabled" };
    const bucket = this.#bucket(address);
    if (compareDecimal(bucket.remaining, amount) < 0) {
      return { ok: false, reason: "agent_allowance_exhausted" };
    }
    let total: Bucket | undefined;
    if (policy.maxTotal) {
      total = this.#totalBucket(policy.maxTotal);
      if (compareDecimal(total.remaining, amount) < 0) {
        return { ok: false, reason: "process_allowance_exhausted" };
      }
    }
    bucket.remaining = subtractDecimalClamped(bucket.remaining, amount);
    if (total) total.remaining = subtractDecimalClamped(total.remaining, amount);
    return { ok: true, remaining: bucket.remaining };
  }

  /**
   * Claim a nonce locally. `false` means it was already served this process —
   * a replay, refused without a network call. Infi's
   * `UNIQUE (network, payer, nonce)` is the real guard; this is the half of it
   * that still works during an outage.
   */
  claimNonce(key: string): boolean {
    if (this.#nonces.has(key)) return false;
    this.#nonces.add(key);
    // Bounded: an authorization's window is minutes, so the oldest entries are
    // long expired and cannot be replayed anyway.
    if (this.#nonces.size > 50_000) {
      const oldest = this.#nonces.values().next();
      if (!oldest.done) this.#nonces.delete(oldest.value);
    }
    return true;
  }

  /** Hold a released payload for replay to `/verify` when Infi returns. */
  enqueue(item: QueuedPayment): void {
    const limit = this.policy?.queueLimit ?? 1000;
    this.#queue.push(item);
    while (this.#queue.length > limit) {
      this.#queue.shift();
      this.#dropped += 1;
    }
  }

  /** Attach the real quantity to a queued payload (a `settle` during an outage). */
  updateQuantity(network: string, payer: string, nonce: string, quantity: string): boolean {
    const item = this.#queue.find(
      (q) => q.network === network && q.payer === payer && q.nonce === nonce,
    );
    if (!item) return false;
    item.quantity = quantity;
    return true;
  }

  /** Everything waiting for replay, oldest first. Drains the queue. */
  drain(): QueuedPayment[] {
    const out = this.#queue;
    this.#queue = [];
    return out;
  }

  get pending(): number {
    return this.#queue.length;
  }

  /** Payloads dropped because the queue was full. A number worth alerting on. */
  get droppedCount(): number {
    return this.#dropped;
  }

  #bucket(address: string): Bucket {
    const policy = this.policy;
    if (!policy) return { remaining: "0", expiresAt: 0 };
    const now = this.#now();
    const key = address.toLowerCase();
    let bucket = this.#agents.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { remaining: policy.maxPerAgent, expiresAt: now + policy.windowMs };
      this.#agents.set(key, bucket);
    } else {
      // Refresh LRU position so eviction drops the least recently seen agent.
      this.#agents.delete(key);
      this.#agents.set(key, bucket);
    }
    while (this.#agents.size > policy.maxAgents) {
      const oldest = this.#agents.keys().next();
      if (oldest.done) break;
      this.#agents.delete(oldest.value);
    }
    return bucket;
  }

  #totalBucket(maxTotal: string): Bucket {
    const now = this.#now();
    if (!this.#total || this.#total.expiresAt <= now) {
      this.#total = { remaining: maxTotal, expiresAt: now + (this.policy?.windowMs ?? 0) };
    }
    return this.#total;
  }
}
