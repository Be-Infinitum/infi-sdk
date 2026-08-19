import {
  InfiError,
  InsufficientCreditError,
  parseErrorResponse,
  requireSlug,
} from "./errors.js";
import { Transport, newIdempotencyKey } from "./http.js";
import { resolveUsageValue, resolveMeterMode, resolveCustomerId, type MeterOptions } from "./meter.js";
import { ProductsResource } from "./resources/products.js";
import { CustomersResource } from "./resources/customers.js";
import { UsageResource } from "./resources/usage.js";
import { InvoicesResource } from "./resources/invoices.js";
import { CouponsResource } from "./resources/coupons.js";
import { LinksResource } from "./resources/links.js";
import { SubscriptionsResource } from "./resources/subscriptions.js";
import { WebhooksResource } from "./resources/webhooks-resource.js";
import { ApiKeysResource } from "./resources/api-keys.js";
import { PayResource } from "./resources/pay.js";
import { ProvidersResource } from "./resources/providers.js";
import { MeteringSession } from "./meter-session.js";
import { verifyWebhook, type WebhookEvent, type WebhookInput } from "./webhooks.js";
import {
  syncBilling,
  type BillingConfig,
  type SyncOptions,
  type SyncResult,
} from "./billing-as-code.js";
import {
  bindWallet,
  walletForCustomer,
  type BoundWallet,
  type Wallet,
  type WalletForCustomerOptions,
} from "./wallet.js";
import type {
  CreateInvoiceRequest,
  CreditSummary,
  InfiConfig,
  InfiMode,
  IngestResult,
  Invoice,
  UsageEvent,
} from "./types.js";
import { modeFromKey, resolveApiBase, resolveAppBase } from "./types.js";

function isPublishableKey(key: string): boolean {
  return key.startsWith("pk_");
}

function isSecretKey(key: string): boolean {
  return key.startsWith("sk_");
}

type CheckoutCommon = {
  /** Merchant slug for the hosted /pay page. */
  slug: string;
  currency?: string;
  dueDate?: string;
  /** Finalize + email the invoice on creation. */
  send?: boolean;
  /** Where the hosted checkout returns the buyer after paying / cancelling. */
  successUrl?: string;
  cancelUrl?: string;
  /**
   * Idempotency key for the invoice this creates. Omit and one is generated per
   * call — enough for a network retry, not for a buyer clicking Buy twice, since
   * the second click is a second call with a fresh key. Derive it from the
   * purchase intent (user + product + day) to collapse both into one invoice.
   */
  idempotencyKey?: string;
};

export type CheckoutOptions =
  | (CheckoutCommon & {
      /** Ad-hoc: bill an existing tenant customer with explicit line items. */
      payerId: string;
      lineItems: CreateInvoiceRequest["lineItems"];
    })
  | (CheckoutCommon & {
      /** Purchase: enroll the customer in this product and open a product-linked invoice. */
      productId: string;
      /**
       * `taxId` is the payer's CPF/CNPJ. Optional here, but pix and boleto on Asaas
       * REFUSE a customer without one ("A CPF/CNPJ is required to process this
       * payment"), so a checkout that will be paid that way has to collect it.
       */
      customer: { externalId: string; email?: string; name?: string; taxId?: string };
      /** Override the auto-derived product price. */
      amount?: string;
      description?: string;
    });

export class Infi {
  readonly #secretKey?: string;
  readonly #mode: InfiMode;
  readonly #apiBase: string;
  readonly #appBase: string;

  /** Catalog: products, versions, prices, meters. */
  readonly products: ProductsResource;
  /** Customers: rate-cards (per-org pricing) and credits. */
  readonly customers: CustomersResource;
  /** Usage totals per meter for a customer window. */
  readonly usage: UsageResource;
  /** Invoices: create, send, void, charge, generate-from-subscription. */
  readonly invoices: InvoicesResource;
  /** Coupons: tenant-wide merchant discounts for subscription invoices. */
  readonly coupons: CouponsResource;
  /** Payment links: share a URL, get paid. */
  readonly links: LinksResource;
  /** Subscriptions: create (with anchor), get, list per enrollment. */
  readonly subscriptions: SubscriptionsResource;
  /**
   * API keys: list, create, revoke tenant keys.
   *
   * Account-owner surface, not reachable with an API key: minting and revoking
   * keys needs a dashboard session with fresh MFA, so these calls always fail for
   * an `sk_` caller. Manage keys in the dashboard, or from the CLI after
   * `infi login`.
   */
  readonly apiKeys: ApiKeysResource;
  /** Webhooks: register endpoints for payment/invoice events. */
  readonly webhooks: WebhooksResource;
  /** Pay: public, slug-based checkout (pix QR + card charge). Browser-safe, no secret key. */
  readonly pay: PayResource;
  /**
   * Payment providers: your own Stripe / Asaas account (read + verify).
   *
   * Account-owner surface, not reachable with an API key: connecting or
   * disconnecting a provider decides where your money goes, so it is a dashboard
   * action behind fresh MFA. Live-only — it 404s in sandbox, where a built-in test
   * provider does the charging.
   */
  readonly providers: ProvidersResource;

  constructor(config: InfiConfig | string) {
    // No key is required for the public endpoints (email-code login, pay). The
    // secret key is only needed server-side (guarded per method). The mode picks
    // the API host — callers never pass a base URL for prod.
    const cfg: InfiConfig = typeof config === "string" ? { secretKey: config } : config;
    if (typeof config === "string" && !isSecretKey(config)) {
      throw new InfiError("Infi constructor expects a secret key (sk_...)", 400, "invalid_key");
    }
    this.#secretKey = cfg.secretKey;
    this.#mode = cfg.mode ?? modeFromKey(cfg.secretKey);
    this.#apiBase = resolveApiBase(this.#mode, cfg.apiUrl);
    // Mode-aware like the API host: a sandbox tenant is not served by the live app.
    this.#appBase = resolveAppBase(this.#mode, cfg.appUrl);

    const transport = new Transport(this.#apiBase, this.#secretKey);
    this.products = new ProductsResource(transport);
    this.customers = new CustomersResource(transport);
    this.usage = new UsageResource(transport);
    this.invoices = new InvoicesResource(transport);
    this.coupons = new CouponsResource(transport);
    this.links = new LinksResource(transport, this.#appBase);
    this.subscriptions = new SubscriptionsResource(transport);
    this.apiKeys = new ApiKeysResource(transport);
    this.webhooks = new WebhooksResource(transport);
    this.pay = new PayResource(this.#apiBase);
    this.providers = new ProvidersResource(transport);
  }

  /** `"sandbox"` or `"live"` — the resolved mode. */
  get mode(): InfiMode {
    return this.#mode;
  }

  /** The API host this client calls (resolved from mode). */
  get apiBase(): string {
    return this.#apiBase;
  }

  /** The app host serving hosted checkout and payment links (resolved from mode). */
  get appBase(): string {
    return this.#appBase;
  }

  // ── Metering: usage ingestion (server-side, secret key) ────────────────────

  /** Ingest a single usage event. A per-event `eventId` is auto-generated when omitted. */
  async track(event: UsageEvent): Promise<IngestResult> {
    this.#requireSecretKey("track");
    const res = await fetch(`${this.#apiBase}/metering/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": newIdempotencyKey(),
      },
      body: JSON.stringify({ eventId: newIdempotencyKey(), ...event }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as IngestResult;
  }

  /**
   * Open a batching usage session for a customer — queue several `track` calls,
   * then `flush()` them as one `trackBatch`. Server-side (secret key).
   */
  session(customerId: string, productId?: string): MeteringSession {
    this.#requireSecretKey("session");
    return new MeteringSession((events) => this.trackBatch(events), customerId, productId);
  }

  /** Ingest a batch of usage events (all-or-nothing). */
  async trackBatch(events: UsageEvent[]): Promise<IngestResult> {
    this.#requireSecretKey("trackBatch");
    const res = await fetch(`${this.#apiBase}/metering/events/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": newIdempotencyKey(),
      },
      body: JSON.stringify({
        events: events.map((e) => ({ eventId: newIdempotencyKey(), ...e })),
      }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as IngestResult;
  }

  /**
   * Meter a credit-consuming call: check the customer has credit, run `fn`,
   * then record its usage — the drop-in wrapper for LLM/token work.
   *
   * Behavior is governed by `options.mode` (see {@link MeterMode}), default
   * `"prepaid"`:
   * - `"prepaid"` — gate then record. The pre-flight gate reads the wallet
   *   balance and throws `InsufficientCreditError` (402) before `fn` runs when it
   *   is exhausted, so you never do the work for free. Drawdown settles
   *   asynchronously, so the balance can lag a little behind recent calls.
   * - `"postpaid"` — record only, never gate (metered API / rate-card).
   * - `"streaming"` — gate only; does NOT record. Record the true value
   *   yourself with `infi.track(...)` once it settles (streaming LLM calls).
   *
   * On record, the usage value is auto-detected from common OpenAI/Anthropic/AI-SDK
   * shapes, or set `value`/`extract`. If `fn` throws, nothing is recorded. The
   * wrapped result is returned unchanged.
   *
   * ```ts
   * const res = await infi.meter({ customerId, meter: "tokens" }, () =>
   *   openai.chat.completions.create({ ... }),
   * );
   * ```
   */
  async meter<T>(options: MeterOptions, fn: () => Promise<T>): Promise<T> {
    this.#requireSecretKey("meter");
    // One id gates and records against the same customer (enrollment id).
    const customerId = resolveCustomerId(options);
    const mode = resolveMeterMode(options);
    if (mode !== "postpaid") {
      await this.assertCredit(customerId);
    }
    const result = await fn();
    if (mode !== "streaming") {
      const value = resolveUsageValue(options, result);
      await this.track({
        customerId,
        meter: options.meter,
        value,
        ...(options.productId ? { productId: options.productId } : {}),
        ...(options.metadata ? { metadata: options.metadata } : {}),
      });
    }
    return result;
  }

  /**
   * Read a customer's credit summary — the gate `meter` uses. Public so callers
   * can gate outside a `meter` call (e.g. at the top of a Server Action).
   */
  async checkCredit(customerId: string): Promise<CreditSummary> {
    this.#requireSecretKey("checkCredit");
    return this.customers.credits.balance(customerId);
  }

  /**
   * Throw `InsufficientCreditError` when the customer's balance is `<= 0`. The
   * pre-flight gate `meter` runs in `"prepaid"`/`"streaming"` mode, exposed
   * so a Server Action or non-route handler can gate without wrapping in `meter`.
   */
  async assertCredit(customerId: string): Promise<void> {
    const summary = await this.checkCredit(customerId);
    const balance = Number(summary.balance ?? "0");
    if (!(balance > 0)) {
      throw new InsufficientCreditError(customerId, summary.balance ?? "0");
    }
  }

  // ── Checkout: create an invoice and hand back the hosted pay URL ──────────

  /**
   * Create an invoice and return the hosted checkout URL a buyer opens to pay
   * (pix / boleto / card). Two shapes:
   *  - ad-hoc: `{ payerId, lineItems }` — bill an existing customer.
   *  - purchase: `{ productId, customer }` — enroll + product-linked invoice, so
   *    deliverable fulfillment (email + download) fires on payment. Amount is
   *    auto-derived from the product's published price unless `amount` is given.
   *
   * Throws `missing_slug` (400) when `slug` is empty — checked before the invoice
   * is created, so a bad call costs you nothing.
   */
  async checkout(opts: CheckoutOptions): Promise<{ invoice: Invoice; invoiceId: string; url: string }> {
    const slug = requireSlug(opts.slug, "checkout");
    let invoice: Invoice;
    if ("productId" in opts) {
      invoice = await this.invoices.createForProduct(opts.productId, {
        customer: {
          externalId: opts.customer.externalId,
          email: opts.customer.email,
          name: opts.customer.name,
          taxId: opts.customer.taxId,
        },
        amount: opts.amount,
        description: opts.description,
        currency: opts.currency,
        dueDate: opts.dueDate,
        send: opts.send,
        successUrl: opts.successUrl,
        cancelUrl: opts.cancelUrl,
      }, opts.idempotencyKey);
    } else {
      invoice = await this.invoices.create({
        payerId: opts.payerId,
        currency: opts.currency,
        dueDate: opts.dueDate,
        send: opts.send,
        lineItems: opts.lineItems,
        successUrl: opts.successUrl,
        cancelUrl: opts.cancelUrl,
      }, opts.idempotencyKey);
    }
    // `Invoice.id` is optional in the generated contract, so `invoice.id` is
    // `string | undefined` and every caller needed a `!` to pass it on. Assert it
    // once here and hand back a plainly-typed `invoiceId`.
    if (!invoice.id) {
      throw new InfiError(
        "checkout: the API returned an invoice without an id.",
        502,
        "invalid_response",
      );
    }
    const url = `${this.#appBase}/pay/${encodeURIComponent(slug)}/invoices/${invoice.id}`;
    return { invoice, invoiceId: invoice.id, url };
  }

  // ── Webhooks: verify an inbound event server-side ─────────────────────────

  /**
   * Verify an inbound webhook (signature + timestamp) and return the parsed
   * event. Throws on mismatch/expiry. Mirrors the backend signer.
   */
  verifyWebhook(input: WebhookInput, secret: string, toleranceSeconds?: number): WebhookEvent {
    return verifyWebhook(input, secret, toleranceSeconds);
  }

  // ── Company as code: apply a declarative config idempotently ──────────────

  /**
   * Apply a declarative catalog config — `defineCompany(...)` /
   * `defineBilling(...)` — as desired state, idempotently. Products, versions,
   * prices, meters and webhooks are created or updated to match it; nothing is
   * ever deleted and a published version is never mutated. Safe to re-run.
   *
   * Pass `{ plan: true }` to dry-run and inspect the actions first. This is also
   * what the CLI runs for `infi sync` / `pull` / `bootstrap` / `doctor`.
   */
  sync(config: BillingConfig, opts?: SyncOptions): Promise<SyncResult> {
    return syncBilling(this, config, opts);
  }

  /**
   * Meter wallet helpers — debit/credit/balance by meter key.
   *
   * Bind to an enrollment id — the `customerId` returned by
   * `customers.create({ externalId })`. Beinfi does not handle end-user login, so
   * identify the customer with your own user id and keep the enrollment it maps to.
   *
   * @example
   * ```ts
   * const w = await infi.wallet.forCustomer(myUserId, { productKey: "ai-chat" });
   * // or, with an enrollment you already have:
   * const w2 = infi.wallet.bind(enrollmentId);
   * await w.debit("tokens", "120");
   * await w.credit({ meter: "tokens", amount: "50000" });
   * ```
   */
  readonly wallet = {
    forCustomer: (externalId: string, options: WalletForCustomerOptions): Promise<Wallet> =>
      walletForCustomer(this, externalId, options),
    bind: (enrollmentId: string, options?: { defaultMeter?: string }): BoundWallet =>
      bindWallet(this, enrollmentId, options),
  };

  #requireSecretKey(method: string): void {
    if (!this.#secretKey) {
      throw new InfiError(`${method} requires a secret key (sk_...)`, 400, "missing_secret_key");
    }
    if (isPublishableKey(this.#secretKey)) {
      throw new InfiError(`${method} cannot use a publishable key`, 403, "invalid_key_kind");
    }
  }
}
