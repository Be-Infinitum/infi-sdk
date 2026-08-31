/**
 * The framework-agnostic half of Infi Rail.
 *
 * `Rail` decides; adapters translate. Everything here speaks
 * `RailRequestLike` -> `RailDecision`, so Express is thirty lines
 * (`express.ts`) and Hono or Fastify would be the same thirty, not a rewrite.
 *
 * SELLER SIDE ONLY. This module never holds a wallet, never signs and never
 * sees a private key. The payer signs an authorization that names the MERCHANT
 * as recipient; there is no field in which Infi could name itself. If anything
 * here ever needs a key, the design has been misread.
 */

import { InfiError } from "../errors.js";
import type {
  RailConfigResponse,
  RailMeterPrice,
  RailSettleRequest,
  RailSettleResponse,
  RailVerifyRequest,
  RailVerifyResponse,
} from "../resources/rail.js";
import { compareAtomic, decimalFromAtomic, normalizeDecimal } from "./amount.js";
import {
  GraceLedger,
  resolveGrace,
  type GraceOptions,
  type QueuedPayment,
} from "./grace.js";
import { decodePaymentHeader, encodePaymentResponse, evmAuthorization } from "./header.js";
import {
  buildRequirements,
  paymentRequiredBody,
  type ResolvedRailSettings,
  type ResolvedRoute,
} from "./requirements.js";
import {
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  type InfiPaymentContext,
  type PaymentPayload,
  type PaymentRequirements,
  type PaymentRequiredBody,
  type RailSettleResult,
} from "./types.js";

/**
 * The Infi calls the rail makes. `Infi` satisfies this structurally, so tests
 * can hand in a stub without constructing a client.
 */
export interface RailClient {
  rail: {
    config(product: string, opts?: { timeoutMs?: number }): Promise<RailConfigResponse>;
    verify(body: RailVerifyRequest, opts?: { timeoutMs?: number }): Promise<RailVerifyResponse>;
    settle(body: RailSettleRequest, opts?: { timeoutMs?: number }): Promise<RailSettleResponse>;
  };
}

/** Settings supplied by hand, skipping (or overriding) `GET /rail/config`. */
export interface RailSettingsInput {
  network?: string;
  /** Contract address or mint. Never a ticker. */
  asset?: string;
  /** From the token contract, never a constant (§4.4). */
  assetDecimals?: number;
  maxTimeoutSeconds?: number;
  /** EIP-712 domain. Without it no client can sign. */
  extra?: Record<string, unknown>;
  /** Prices per meter, in the asset's currency. */
  meters?: Record<string, RailMeterPrice>;
}

/** Something worth logging. Every field is already in the merchant's own path. */
export type RailEvent =
  | { type: "released"; verifiedBy: "infi" | "grace"; payer: string; meter: string; amount: string }
  | { type: "refused"; reason: string; payer?: string; meter: string }
  | { type: "grace_replayed"; payer: string; nonce: string; accepted: boolean; reason?: string }
  | { type: "grace_queue_dropped"; dropped: number };

export interface RequirePaymentOptions {
  /** Product key the routes sell. Its meters carry the prices. */
  product: string;
  /**
   * The merchant's wallet — where the money lands. Checked against the tenant's
   * `rail_settings` at mount: a disagreement is refused loudly, because every
   * authorization signed against the wrong address would be rejected anyway.
   */
  wallet: string;
  /** Per-process allowance for Infi outages (§6). `false` disables it. */
  grace?: GraceOptions | false;
  /** Supply settings by hand instead of reading `GET /rail/config`. */
  settings?: RailSettingsInput;
  /**
   * Absolute base URL of this server, e.g. `https://api.merchant.com`. Behind a
   * proxy the request's own host is the proxy's, and `resource` must be the URL
   * the agent called — it is part of what gets signed.
   */
  baseUrl?: string;
  /** Budget for `/verify` before grace takes over. Default 3000ms. */
  verifyTimeoutMs?: number;
  /** Declare routes to the Bazaar index (§9.1). Default true. */
  discoverable?: boolean;
  /** Observability hook. Never throws into the request path. */
  onEvent?: (event: RailEvent) => void;
}

/** Per-route options — `pay({ meter, max })`. */
export interface PayOptions {
  /** Meter this route bills against. Its price comes from the product. */
  meter: string;
  /**
   * Ceiling quantity for a variable-price route: the handler authorizes up to
   * this and trues up with `req.infi.settle({ quantity })` (§5.1).
   */
  max?: number | string;
  /** Fixed quantity for this route. Default 1. Ignored when `max` is set. */
  quantity?: number | string;
  /** Unit price override, in the asset's currency. Defaults to the product's. */
  price?: string;
  /** `accepts[].description` — one sentence an agent reads. */
  description?: string;
  /** `accepts[].mimeType`. Default `""`, which is what ships. */
  mimeType?: string;
  /** Force the `resource` URL, when the request's own is not what agents call. */
  resource?: string;
  /**
   * Hold the handler's response until the payment settles, and answer 402 if it
   * does not. Default TRUE, which is the shape the reference implementations use:
   * the merchant risks the compute, never the goods.
   *
   * Set false for a route that STREAMS — a buffer cannot stream — accepting that
   * such a route delivers before the payment is confirmed. The cost of the default
   * is latency: an on-chain write sits inside the endpoint's response time.
   */
  withholdUntilSettled?: boolean;
  /** Declare this route for discovery. Defaults to the mount's setting. */
  discoverable?: boolean;
  /** JSON schema of the route's input, published for discovery. */
  inputSchema?: Record<string, unknown>;
  /** Full `outputSchema` override. Wins over `discoverable`/`inputSchema`. */
  outputSchema?: Record<string, unknown>;
  /** Seconds the agent has to complete the exchange. Defaults to the mount's. */
  maxTimeoutSeconds?: number;
}

/** A request, as the core needs to see it. Adapters build this. */
export interface RailRequestLike {
  method: string;
  /** Absolute URL, or a path when the mount supplies `baseUrl`. */
  url: string;
  /** Case-insensitive header read. */
  header(name: string): string | undefined;
}

export type RailDecision =
  | {
      release: true;
      infi: InfiPaymentContext;
      /** Headers to set on the response — `X-PAYMENT-RESPONSE`. */
      headers: Record<string, string>;
      /**
       * What this request was priced against. Carried so that a refusal raised
       * LATER — settlement, under withheld delivery — can build the same 402 body
       * without recomputing a price the agent already signed for. Recomputing it
       * would risk answering with requirements that differ from the ones quoted.
       */
      requirements: PaymentRequirements;
    }
  | {
      release: false;
      status: 402;
      headers: Record<string, string>;
      body: PaymentRequiredBody;
    };

const DEFAULT_VERIFY_TIMEOUT_MS = 3000;
const DEFAULT_MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_CLOCK_SKEW_SECONDS = 5;

/**
 * Resolve settings once, at mount. `GET /rail/config` is skipped entirely when
 * the caller supplied network, asset and decimals — which is also how this runs
 * before the backend endpoint exists.
 */
async function resolveSettings(
  client: RailClient,
  opts: RequirePaymentOptions,
): Promise<{ settings: ResolvedRailSettings; meters: Record<string, RailMeterPrice>; grace?: RailConfigResponse["grace"] }> {
  const local = opts.settings ?? {};
  const complete =
    local.network !== undefined && local.asset !== undefined && local.assetDecimals !== undefined;
  const remote: RailConfigResponse = complete
    ? { network: local.network!, asset: local.asset!, assetDecimals: local.assetDecimals! }
    : await client.rail.config(opts.product);

  const network = local.network ?? remote.network;
  const asset = local.asset ?? remote.asset;
  const assetDecimals = local.assetDecimals ?? remote.assetDecimals;
  const extra = local.extra ?? remote.extra;

  for (const [field, value] of Object.entries({ network, asset })) {
    if (typeof value !== "string" || !value) {
      throw new InfiError(
        `rail: no ${field} configured for product "${opts.product}". Set it in the dashboard, or pass \`settings.${field}\`.`,
        400,
        "rail_not_configured",
      );
    }
  }
  if (typeof assetDecimals !== "number") {
    throw new InfiError(
      `rail: no assetDecimals for asset ${asset}. It is read from the token contract — ` +
        "hardcoding 6 works until the first non-USDC asset and then overcharges by a thousand.",
      400,
      "rail_not_configured",
    );
  }
  // A wallet the tenant did not configure produces authorizations Infi refuses
  // for recipient mismatch, one per request, forever. Fail at mount instead.
  if (remote.payTo && remote.payTo.toLowerCase() !== opts.wallet.toLowerCase()) {
    throw new InfiError(
      `rail: wallet ${opts.wallet} does not match the tenant's configured rail wallet ${remote.payTo}. ` +
        "Money lands at the configured one; every payment signed against the other is rejected.",
      400,
      "rail_wallet_mismatch",
    );
  }
  // On EVM, `extra` IS the EIP-712 domain: without it no client can sign, so
  // every request would 402 forever with nothing in the response explaining why.
  // Refuse at mount instead. SVM has no domain and is exempt.
  if (!extra && !network.startsWith("solana")) {
    throw new InfiError(
      `rail: no EIP-712 domain (accepts[].extra) for asset ${asset} on ${network}. ` +
        'No client can sign without it — set it on the tenant\'s rail settings, or pass ' +
        '`settings.extra: { name: "USDC", version: "2" }`.',
      400,
      "rail_missing_eip712_domain",
    );
  }

  return {
    settings: {
      network,
      asset,
      assetDecimals,
      payTo: opts.wallet,
      maxTimeoutSeconds:
        local.maxTimeoutSeconds ?? remote.maxTimeoutSeconds ?? DEFAULT_MAX_TIMEOUT_SECONDS,
      ...(extra ? { extra } : {}),
    },
    meters: { ...(remote.meters ?? {}), ...(local.meters ?? {}) },
    ...(remote.grace ? { grace: remote.grace } : {}),
  };
}

/**
 * Mount the rail: resolve settings once, then hand back a factory that prices
 * individual routes. Async because the asset's decimals and the route's price
 * are the backend's to state, not the middleware's to guess.
 */
export async function createRail(client: RailClient, opts: RequirePaymentOptions): Promise<Rail> {
  const resolved = await resolveSettings(client, opts);
  return new Rail(client, opts, resolved.settings, resolved.meters, resolved.grace);
}

/** A mounted rail: priced routes, the grace ledger, and the replay queue. */
export class Rail {
  readonly product: string;
  readonly settings: ResolvedRailSettings;
  readonly grace: GraceLedger;
  readonly meters: Record<string, RailMeterPrice>;

  readonly #client: RailClient;
  readonly #opts: RequirePaymentOptions;
  readonly #verifyTimeoutMs: number;
  #pendingSettles: RailSettleRequest[] = [];
  #flushing = false;

  constructor(
    client: RailClient,
    opts: RequirePaymentOptions,
    settings: ResolvedRailSettings,
    meters: Record<string, RailMeterPrice>,
    backendGrace: RailConfigResponse["grace"],
  ) {
    this.#client = client;
    this.#opts = opts;
    this.product = opts.product;
    this.settings = settings;
    this.meters = meters;
    this.grace = new GraceLedger(resolveGrace(opts.grace, backendGrace));
    this.#verifyTimeoutMs = opts.verifyTimeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;
  }

  /** Price one route. Throws at mount when the meter has no price. */
  route(options: PayOptions): RailRoute {
    const price = options.price ?? this.meters[options.meter]?.unitAmount;
    if (price === undefined) {
      throw new InfiError(
        `rail: meter "${options.meter}" has no price on product "${this.product}". ` +
          "Add a price in your company file (or pass `price`) — a route with no price cannot state what it costs.",
        400,
        "rail_meter_not_priced",
      );
    }
    const quantity = normalizeDecimal(options.max ?? options.quantity ?? 1);
    const resolved: ResolvedRoute = {
      meter: options.meter,
      quantity,
      unitAmount: price,
      description:
        options.description ??
        this.meters[options.meter]?.description ??
        `${this.product}: ${options.meter}`,
      mimeType: options.mimeType ?? "",
      discoverable: options.discoverable ?? this.#opts.discoverable ?? true,
      ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
      ...(options.inputSchema ? { inputSchema: options.inputSchema } : {}),
      ...(options.maxTimeoutSeconds !== undefined
        ? { maxTimeoutSeconds: options.maxTimeoutSeconds }
        : {}),
    };
    return new RailRoute(this, resolved, options.resource);
  }

  /** @internal */
  get client(): RailClient {
    return this.#client;
  }

  /** @internal */
  get verifyTimeoutMs(): number {
    return this.#verifyTimeoutMs;
  }

  /** @internal */
  get baseUrl(): string | undefined {
    return this.#opts.baseUrl;
  }

  /** @internal Clock skew tolerated when checking an authorization's window. */
  get clockSkewSeconds(): number {
    return this.grace.policy?.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  }

  /** @internal */
  emit(event: RailEvent): void {
    if (!this.#opts.onEvent) return;
    try {
      this.#opts.onEvent(event);
    } catch {
      // A logging hook must never take down a paid request.
    }
  }

  /** @internal Queue a true-up that could not reach Infi. */
  queueSettle(body: RailSettleRequest): void {
    this.#pendingSettles.push(body);
    while (this.#pendingSettles.length > (this.grace.policy?.queueLimit ?? 1000)) {
      this.#pendingSettles.shift();
    }
  }

  /**
   * Replay everything grace released while Infi was unreachable.
   *
   * A replay that loses the claim was a duplicate and is dropped — that is the
   * `UNIQUE (network, payer, nonce)` guard doing its job, not an error. Runs
   * automatically after the first `/verify` that answers again.
   */
  async flushGrace(): Promise<{ replayed: number; refused: number; requeued: number }> {
    if (this.#flushing) return { replayed: 0, refused: 0, requeued: 0 };
    this.#flushing = true;
    let replayed = 0;
    let refused = 0;
    let requeued = 0;
    try {
      const items = this.grace.drain();
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] as QueuedPayment;
        try {
          const res = await this.#client.rail.verify(
            {
              paymentPayload: item.paymentPayload,
              paymentRequirements: item.paymentRequirements,
              payment: item.payment,
              product: item.product,
              meter: item.meter,
              quantity: item.quantity,
              verifiedBy: "grace",
            },
            { timeoutMs: this.#verifyTimeoutMs },
          );
          if (res.isValid) replayed += 1;
          else refused += 1;
          this.emit({
            type: "grace_replayed",
            payer: item.payer,
            nonce: item.nonce,
            accepted: res.isValid,
            ...(res.invalidReason ? { reason: res.invalidReason } : {}),
          });
        } catch (err) {
          if (!isUnreachable(err)) {
            // A verdict (or our own misconfiguration): replaying it again will
            // fail the same way, so count it and move on.
            refused += 1;
            continue;
          }
          // Still down. Put the rest back, oldest first, and stop.
          for (const rest of items.slice(i)) {
            this.grace.enqueue(rest);
            requeued += 1;
          }
          break;
        }
      }
      const settles = this.#pendingSettles;
      this.#pendingSettles = [];
      for (const body of settles) {
        try {
          await this.#client.rail.settle(body, { timeoutMs: this.#verifyTimeoutMs });
        } catch (err) {
          if (isUnreachable(err)) this.#pendingSettles.push(body);
        }
      }
    } finally {
      this.#flushing = false;
    }
    return { replayed, refused, requeued };
  }
}

/** One priced route. Stateless per request; everything shared lives on `Rail`. */
export class RailRoute {
  constructor(
    private readonly rail: Rail,
    private readonly route: ResolvedRoute,
    private readonly resourceOverride?: string,
  ) {}

  /** The `accepts[]` entry this route would publish for this request. */
  requirements(req: RailRequestLike): PaymentRequirements {
    return buildRequirements(this.rail.settings, this.route, {
      resource: this.resource(req),
      method: req.method,
    });
  }

  /** The 402 body an unpaid request gets. */
  paymentRequired(req: RailRequestLike, error: string): PaymentRequiredBody {
    return paymentRequiredBody(error, [this.requirements(req)]);
  }

  /**
   * Decide one request: 402, or release with `req.infi`.
   *
   * Never throws for a payment problem — a bad payment is a 402, which is a
   * protocol answer the agent can act on. It throws only when the merchant's own
   * setup is wrong (a 401 from Infi, a missing endpoint), because that must be
   * loud rather than quietly served or quietly refused.
   */
  async decide(req: RailRequestLike): Promise<RailDecision> {
    const requirements = this.requirements(req);
    const raw = req.header(PAYMENT_HEADER);
    if (!raw) {
      this.rail.emit({ type: "refused", reason: "payment_required", meter: this.route.meter });
      return this.#refuse(requirements, "X-PAYMENT header is required");
    }

    let payload: PaymentPayload;
    try {
      payload = decodePaymentHeader(raw);
    } catch {
      // Undecodable, wrong version, wrong scheme: all one thing to an agent —
      // the payment it sent is not usable, and `accepts` says what would be.
      this.rail.emit({ type: "refused", reason: "invalid_payment", meter: this.route.meter });
      return this.#refuse(requirements, "invalid_payment");
    }

    const preflight = this.#preflight(payload, requirements);
    if (preflight) {
      this.rail.emit({ type: "refused", reason: preflight, meter: this.route.meter });
      return this.#refuse(requirements, preflight);
    }

    let verdict: RailVerifyResponse;
    try {
      verdict = await this.rail.client.rail.verify(
        {
          paymentPayload: payload,
          paymentRequirements: requirements,
          payment: raw,
          product: this.rail.product,
          meter: this.route.meter,
          quantity: this.route.quantity,
        },
        { timeoutMs: this.rail.verifyTimeoutMs },
      );
    } catch (err) {
      // A 402 from Infi is a verdict in another envelope, not an outage.
      if (err instanceof InfiError && err.status === 402) {
        const reason = err.code ?? "invalid_payment";
        this.rail.emit({ type: "refused", reason, meter: this.route.meter });
        return this.#refuse(requirements, reason);
      }
      if (!isUnreachable(err)) throw err;
      return this.#graceDecide(req, payload, requirements, raw);
    }

    if (!verdict.isValid) {
      const reason = verdict.invalidReason ?? "invalid_payment";
      this.rail.emit({
        type: "refused",
        reason,
        meter: this.route.meter,
        ...(verdict.payer ? { payer: verdict.payer } : {}),
      });
      return this.#refuse(requirements, reason);
    }

    // Infi answered, so anything grace released is now replayable. Fire and
    // forget: a queue flush must not add latency to a paid request.
    if (this.rail.grace.pending > 0) void this.rail.flushGrace().catch(() => undefined);

    const auth = this.#authorization(payload, requirements, raw, req);
    const payer = verdict.payer ?? auth.payer;
    this.rail.emit({
      type: "released",
      verifiedBy: "infi",
      payer,
      meter: this.route.meter,
      amount: auth.valueDecimal,
    });
    return this.#release({
      agent: {
        address: verdict.agent?.address ?? payer,
        network: verdict.agent?.network ?? payload.network,
        ...(verdict.agent?.id ? { id: verdict.agent.id } : {}),
        ...(verdict.agent?.enrollmentId ? { enrollmentId: verdict.agent.enrollmentId } : {}),
      },
      authorization: { ...auth, payer },
      verifiedBy: "infi",
    }, requirements);
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** The URL the agent called — it is part of what was signed, so it must match. */
  private resource(req: RailRequestLike): string {
    if (this.resourceOverride) return this.resourceOverride;
    const base = this.rail.baseUrl;
    if (!base) return req.url;
    const path = req.url.startsWith("http") ? new URL(req.url).pathname + new URL(req.url).search : req.url;
    return new URL(path, base).toString();
  }

  /**
   * Checks we can make without Infi. Cheap, and they keep a payload that could
   * never be accepted from burning a nonce: refused here, the agent can re-sign
   * against the right requirements instead of having to mint a new one.
   */
  #preflight(payload: PaymentPayload, requirements: PaymentRequirements): string | null {
    if (payload.network !== requirements.network) return "invalid_payment";
    const auth = evmAuthorization(payload);
    // Non-EVM payloads are opaque to us by design; Infi (and the facilitator)
    // validate them. Nothing local to check.
    if (!auth) return null;
    if (auth.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
      return "invalid_exact_evm_payload_recipient_mismatch";
    }
    if (compareAtomic(auth.value, requirements.maxAmountRequired) < 0) {
      return "insufficient_funds";
    }
    const now = Math.floor(Date.now() / 1000);
    const skew = this.rail.clockSkewSeconds;
    if (Number(auth.validBefore) + skew < now) return "payment_expired";
    if (Number(auth.validAfter) - skew > now) return "invalid_payment";
    return null;
  }

  /**
   * Infi is unreachable. Spend the allowance, or refuse — the one thing this
   * must never do is release for free and call it success.
   */
  async #graceDecide(
    req: RailRequestLike,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    raw: string,
  ): Promise<RailDecision> {
    const grace = this.rail.grace;
    const auth = evmAuthorization(payload);
    // No local check is possible on a payload shape we do not parse, and
    // releasing one unchecked would be failing open.
    if (!grace.enabled || !auth) return this.#unavailable(requirements);

    const key = `${payload.network}:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`;
    if (!grace.claimNonce(key)) {
      this.rail.emit({ type: "refused", reason: "invalid_payment", meter: this.route.meter, payer: auth.from });
      return this.#refuse(requirements, "invalid_payment");
    }

    const verifier = grace.policy?.verifySignature;
    if (verifier) {
      let signatureOk = false;
      try {
        signatureOk = await verifier(payload, requirements);
      } catch {
        signatureOk = false;
      }
      if (!signatureOk) {
        return this.#refuse(requirements, "invalid_exact_evm_payload_signature");
      }
    }

    const amount = decimalFromAtomic(auth.value, this.rail.settings.assetDecimals);
    const spend = grace.spend(auth.from, amount);
    if (!spend.ok) {
      this.rail.emit({
        type: "refused",
        reason: "verification_unavailable",
        meter: this.route.meter,
        payer: auth.from,
      });
      return this.#unavailable(requirements);
    }

    const authorization = this.#authorization(payload, requirements, raw, req);
    grace.enqueue({
      payment: raw,
      paymentPayload: payload,
      paymentRequirements: requirements,
      product: this.rail.product,
      meter: this.route.meter,
      quantity: this.route.quantity,
      network: payload.network,
      payer: auth.from,
      nonce: auth.nonce,
      releasedAt: Date.now(),
    });
    this.rail.emit({
      type: "released",
      verifiedBy: "grace",
      payer: auth.from,
      meter: this.route.meter,
      amount,
    });
    return this.#release({
      agent: { address: auth.from, network: payload.network },
      authorization,
      verifiedBy: "grace",
    }, requirements);
  }

  #authorization(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    raw: string,
    req: RailRequestLike,
  ) {
    const auth = evmAuthorization(payload);
    const valueAtomic = auth?.value ?? requirements.maxAmountRequired;
    return {
      scheme: payload.scheme,
      network: payload.network,
      payer: auth?.from ?? "",
      payTo: auth?.to ?? requirements.payTo,
      asset: requirements.asset,
      valueAtomic,
      // RISK ZONE (money): the only place an atomic value becomes an amount.
      valueDecimal: decimalFromAtomic(valueAtomic, this.rail.settings.assetDecimals),
      validAfter: Number(auth?.validAfter ?? 0),
      validBefore: Number(auth?.validBefore ?? 0),
      nonce: auth?.nonce ?? "",
      resource: this.resource(req),
      meter: this.route.meter,
      raw,
    };
  }

  #release(
    input: Omit<InfiPaymentContext, "settle">,
    requirements: PaymentRequirements,
  ): RailDecision {
    const context: InfiPaymentContext = {
      ...input,
      settle: (settleInput) => this.#settle(input, settleInput),
    };
    return {
      release: true,
      infi: context,
      requirements,
      headers: {
        [PAYMENT_RESPONSE_HEADER]: encodePaymentResponse({
          success: true,
          // Empty here: under withheld delivery the adapter overwrites this with the
          // real transaction after settling, and a route that opted out has no hash
          // to state yet.
          transaction: "",
          network: input.authorization.network,
          payer: input.authorization.payer,
        }),
      },
    };
  }

  /**
   * Settle NOW and report whether the buffered response may be released.
   *
   * Distinct from `#settle`, which is the optional variable-price true-up and is
   * fire-and-forget. This one is the gate: its answer decides whether the buyer
   * receives the bytes, so an unreachable Infi is `unknown` and never `settled`.
   */
  /**
   * Settle NOW, and answer with a decision the adapter already knows how to write.
   *
   * Returning a `RailDecision` rather than a raw outcome keeps the knowledge here:
   * the adapters are supposed to know only how to read a header, write a 402 and
   * call next(). It also means the receipt carries the REAL transaction, which is
   * impossible before settling.
   *
   * Distinct from `#settle`, which is the optional variable-price true-up and is
   * fire-and-forget. This one is the gate — its answer decides whether the buyer
   * receives the bytes.
   */
  async settleNow(
    released: Omit<InfiPaymentContext, "settle">,
    requirements: PaymentRequirements,
    quantity?: number | string,
  ): Promise<RailDecision> {
    const auth = released.authorization;
    const body: RailSettleRequest = {
      network: auth.network,
      payer: auth.payer,
      nonce: auth.nonce,
      quantity: normalizeDecimal(quantity ?? this.route.quantity),
      meter: auth.meter,
    };

    let status = "unknown";
    let reason: string | undefined;
    let transaction = "";
    try {
      const out = await this.rail.client.rail.settle(body, {
        timeoutMs: this.rail.verifyTimeoutMs,
      });
      status = out.status ?? "unknown";
      reason = out.reason;
      transaction = out.transaction ?? "";
    } catch {
      // Infi did not answer. The payment may well have settled, so this is
      // `unknown` — withhold, but never tell the agent it failed to pay.
      status = "unknown";
    }

    if (status === "settled") {
      return {
        release: true,
        infi: { ...released, settle: (i) => this.#settle(released, i) },
        requirements,
        headers: {
          [PAYMENT_RESPONSE_HEADER]: encodePaymentResponse({
            success: true,
            transaction,
            network: auth.network,
            payer: auth.payer,
          }),
        },
      };
    }

    // Refused and unknown BOTH withhold, and they are not the same thing: an
    // unknown settlement may have landed, so the code says so rather than telling
    // the agent its payment was declined.
    return this.#refuse(
      requirements,
      status === "unknown" ? "settlement_unknown" : (reason ?? "settlement_failed"),
    );
  }

  async #settle(
    released: Omit<InfiPaymentContext, "settle">,
    input: { quantity: number | string },
  ): Promise<RailSettleResult> {
    const quantity = normalizeDecimal(input.quantity);
    const auth = released.authorization;
    const body: RailSettleRequest = {
      network: auth.network,
      payer: auth.payer,
      nonce: auth.nonce,
      quantity,
      meter: auth.meter,
    };
    // Released on grace: the claim itself has not reached Infi yet, so the real
    // quantity rides with the queued payload rather than as its own call.
    if (released.verifiedBy === "grace") {
      if (this.rail.grace.updateQuantity(auth.network, auth.payer, auth.nonce, quantity)) {
        return { accepted: false, status: "queued" };
      }
    }
    try {
      await this.rail.client.rail.settle(body, { timeoutMs: this.rail.verifyTimeoutMs });
      return { accepted: true, status: "recorded" };
    } catch (err) {
      if (!isUnreachable(err)) throw err;
      this.rail.queueSettle(body);
      return { accepted: false, status: "queued" };
    }
  }

  #refuse(requirements: PaymentRequirements, error: string): RailDecision {
    return {
      release: false,
      status: 402,
      headers: { "Content-Type": "application/json" },
      body: paymentRequiredBody(error, [requirements]),
    };
  }

  /** §6's honest refusal: nothing was delivered, and the agent can retry. */
  #unavailable(requirements: PaymentRequirements): RailDecision {
    return this.#refuse(requirements, "verification_unavailable");
  }
}

/**
 * Is this an outage or a verdict?
 *
 * Only an outage may spend grace, so the classification is load-bearing. An
 * `InfiError` carries a status, and only 5xx / 408 / 429 mean "Infi did not
 * answer"; everything else with a status is an answer, including the 401 that
 * says the merchant's key is wrong — which must be loud, never grace. A throw
 * with no status came from `fetch` itself (DNS, connect, abort), and the try
 * block around it contains exactly one call, so there is nothing else it could
 * be.
 */
export function isUnreachable(err: unknown): boolean {
  if (err instanceof InfiError) {
    return err.status >= 500 || err.status === 408 || err.status === 429;
  }
  return true;
}
