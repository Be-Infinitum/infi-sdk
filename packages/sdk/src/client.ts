import { InfiError, InsufficientCreditError, parseErrorResponse } from "./errors.js";
import { extractCodeFromUrl } from "./hosted.js";
import { Transport } from "./http.js";
import { resolveUsageValue, resolveMeterMode, resolveCustomerId, type MeterOptions } from "./meter.js";
import { ProductsResource } from "./resources/products.js";
import { CustomersResource } from "./resources/customers.js";
import { AppsResource } from "./resources/apps.js";
import { UsageResource } from "./resources/usage.js";
import { InvoicesResource } from "./resources/invoices.js";
import { SubscriptionsResource } from "./resources/subscriptions.js";
import { SandboxResource } from "./resources/sandbox.js";
import { verifyWebhook, type WebhookEvent, type WebhookInput } from "./webhooks.js";
import {
  syncBilling,
  type BillingConfig,
  type SyncOptions,
  type SyncResult,
} from "./billing-as-code.js";
import type {
  AuthResult,
  CreateInvoiceRequest,
  CreditSummary,
  ExchangeCodeOptions,
  HostedAppConfig,
  InfiConfig,
  InfiRequestLike,
  IngestResult,
  Invoice,
  SendEmailCodeOptions,
  SessionIntrospection,
  UsageEvent,
  VerifyEmailCodeOptions,
} from "./types.js";
import { DEFAULT_API_BASE, DEFAULT_AUTH_BASE, DEFAULT_PAY_BASE } from "./types.js";

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
      customer: { externalId: string; email?: string; name?: string };
      /** Override the auto-derived product price. */
      amount?: string;
      description?: string;
    });

export class Infi {
  readonly #secretKey?: string;
  readonly #baseUrl: string;
  readonly #authBaseUrl: string;
  readonly #payBaseUrl: string;

  /** Catalog: products, versions, prices, meters. */
  readonly products: ProductsResource;
  /** Customers: rate-cards (per-org pricing) and credits. */
  readonly customers: CustomersResource;
  /** Apps: register + configure identity apps (slug, origins, redirect URIs). */
  readonly apps: AppsResource;
  /** Usage totals per meter for a customer window. */
  readonly usage: UsageResource;
  /** Invoices: create, send, void, charge, generate-from-subscription. */
  readonly invoices: InvoicesResource;
  /** Subscriptions: create (with anchor), get, list per enrollment. */
  readonly subscriptions: SubscriptionsResource;
  /** Sandbox: provision claimable test tenants (public, no secret key). */
  readonly sandbox: SandboxResource;

  constructor(config: InfiConfig | string) {
    if (typeof config === "string") {
      if (!isSecretKey(config)) {
        throw new InfiError("Infi constructor expects a secret key (sk_...)", 400, "invalid_key");
      }
      this.#secretKey = config;
      this.#baseUrl = DEFAULT_API_BASE;
      this.#authBaseUrl = DEFAULT_AUTH_BASE;
      this.#payBaseUrl = DEFAULT_PAY_BASE;
    } else {
      // No key is required for the public email-code endpoints (sendEmailCode /
      // verifyEmailCode / getAppConfig). The secret key is only needed server-side
      // for exchangeCode, metering and the billing surface (guarded per method).
      this.#secretKey = config.secretKey;
      this.#baseUrl = (config.baseUrl ?? DEFAULT_API_BASE).replace(/\/$/, "");
      this.#authBaseUrl = (config.authBaseUrl ?? DEFAULT_AUTH_BASE).replace(/\/$/, "");
      this.#payBaseUrl = (config.payBaseUrl ?? DEFAULT_PAY_BASE).replace(/\/$/, "");
    }

    const transport = new Transport(this.#baseUrl, this.#secretKey);
    this.products = new ProductsResource(transport);
    this.customers = new CustomersResource(transport);
    this.apps = new AppsResource(transport);
    this.usage = new UsageResource(transport);
    this.invoices = new InvoicesResource(transport);
    this.subscriptions = new SubscriptionsResource(transport);
    this.sandbox = new SandboxResource(transport, this.#baseUrl);
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  get authBaseUrl(): string {
    return this.#authBaseUrl;
  }

  // ── Identity: email-code login (public, slug-scoped) ───────────────────────

  /**
   * Send a 6-digit email verification code for the given app slug.
   * Public endpoint — always resolves on success (no account enumeration).
   */
  async sendEmailCode(options: SendEmailCodeOptions): Promise<{ status: "sent" }> {
    const res = await fetch(this.#appUrl(options.slug, "email-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: options.email,
        redirectTo: options.redirectTo,
        state: options.state,
      }),
    });

    if (res.status === 202) {
      return { status: "sent" };
    }
    throw await parseErrorResponse(res);
  }

  /**
   * Verify an email code and obtain the redirect URL carrying a single-use auth code.
   * Navigate the browser to `redirectUrl` to complete the hosted flow.
   */
  async verifyEmailCode(options: VerifyEmailCodeOptions): Promise<{ redirectUrl: string }> {
    const res = await fetch(this.#appUrl(options.slug, "verify-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: options.email, code: options.code }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as { redirectUrl: string };
  }

  /** Fetch public branding/config for an app's hosted login page. */
  async getAppConfig(slug: string): Promise<HostedAppConfig> {
    const res = await fetch(this.#appUrl(slug, "config"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as HostedAppConfig;
  }

  // ── Identity: auth-code exchange (server-side, secret key) ─────────────────

  /** Exchange a single-use auth code for a verified identity and optional session. */
  async exchangeCode(code: string, options: ExchangeCodeOptions = {}): Promise<AuthResult> {
    this.#requireSecretKey("exchangeCode");
    const res = await fetch(`${this.#baseUrl}/identity/exchange`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        sessionMode: options.sessionMode,
      }),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as AuthResult;
  }

  /**
   * Resolve a session token (from the infi_session cookie) back to its identity
   * and customer. Server-side — requires the secret key.
   */
  async getSession(token: string): Promise<SessionIntrospection> {
    this.#requireSecretKey("getSession");
    const res = await fetch(`${this.#baseUrl}/identity/session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "X-Infi-Session": token,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as SessionIntrospection;
  }

  /** Extract auth code from a hosted callback request and exchange it. */
  async exchangeCodeFromRequest(req: InfiRequestLike): Promise<AuthResult> {
    const code = extractCodeFromUrl(req.url);
    if (!code) {
      throw new InfiError("Missing auth code in request", 400, "missing_code");
    }
    return this.exchangeCode(code);
  }

  // ── Metering: usage ingestion (server-side, secret key) ────────────────────

  /** Ingest a single usage event. */
  async track(event: UsageEvent): Promise<IngestResult> {
    this.#requireSecretKey("track");
    const res = await fetch(`${this.#baseUrl}/metering/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as IngestResult;
  }

  /** Ingest a batch of usage events (all-or-nothing). */
  async trackBatch(events: UsageEvent[]): Promise<IngestResult> {
    this.#requireSecretKey("trackBatch");
    const res = await fetch(`${this.#baseUrl}/metering/events/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
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
   *   is exhausted, so you never do the work for free (ADR 0010: enforcement at
   *   the request edge; prepaid drawdown settles async, so balance may lag).
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
   */
  async checkout(opts: CheckoutOptions): Promise<{ invoice: Invoice; url: string }> {
    let invoice: Invoice;
    if ("productId" in opts) {
      invoice = await this.invoices.createForProduct(opts.productId, {
        customer: {
          externalId: opts.customer.externalId,
          email: opts.customer.email,
          name: opts.customer.name,
        },
        amount: opts.amount,
        description: opts.description,
        currency: opts.currency,
        dueDate: opts.dueDate,
        send: opts.send,
        successUrl: opts.successUrl,
        cancelUrl: opts.cancelUrl,
      });
    } else {
      invoice = await this.invoices.create({
        payerId: opts.payerId,
        currency: opts.currency,
        dueDate: opts.dueDate,
        send: opts.send,
        lineItems: opts.lineItems,
        successUrl: opts.successUrl,
        cancelUrl: opts.cancelUrl,
      });
    }
    const url = `${this.#payBaseUrl}/pay/${encodeURIComponent(opts.slug)}/invoices/${invoice.id}`;
    return { invoice, url };
  }

  // ── Webhooks: verify an inbound event server-side ─────────────────────────

  /**
   * Verify an inbound webhook (signature + timestamp) and return the parsed
   * event. Throws on mismatch/expiry. Mirrors the backend signer.
   */
  verifyWebhook(input: WebhookInput, secret: string, toleranceSeconds?: number): WebhookEvent {
    return verifyWebhook(input, secret, toleranceSeconds);
  }

  // ── Billing as code: apply a declarative config idempotently ──────────────

  /** Apply a `defineBilling(...)` config idempotently (pass `{ plan: true }` to dry-run). */
  sync(config: BillingConfig, opts?: SyncOptions): Promise<SyncResult> {
    return syncBilling(this, config, opts);
  }

  #appUrl(slug: string, action: string): string {
    return `${this.#baseUrl}/identity/apps/${encodeURIComponent(slug)}/${action}`;
  }

  #requireSecretKey(method: string): void {
    if (!this.#secretKey) {
      throw new InfiError(`${method} requires a secret key (sk_...)`, 400, "missing_secret_key");
    }
    if (isPublishableKey(this.#secretKey)) {
      throw new InfiError(`${method} cannot use a publishable key`, 403, "invalid_key_kind");
    }
  }
}
