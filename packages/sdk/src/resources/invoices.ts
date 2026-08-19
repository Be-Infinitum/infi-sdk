import type { Transport } from "../http.js";
import type {
  CreateInvoiceRequest,
  CreateProductInvoiceRequest,
  Invoice,
  Payment,
  PaymentMethod,
} from "../types.js";

const enc = encodeURIComponent;

/**
 * A download grant: what fulfillment mints when a payment on a deliverable
 * product confirms. One per payment.
 */
export interface DeliverableGrant {
  /** The payment that produced this grant. */
  paymentId: string;
  /**
   * The capability token. Whoever holds it can download the paid product, with
   * no further proof of purchase — so treat it like a password: don't log it,
   * don't put it in a URL you share.
   */
  token: string;
  /** Ready-to-use public URL; 302-redirects to the file or link. */
  downloadUrl: string;
  /** When the buyer's email went out. Absent if it hasn't — see `deliverable()`. */
  emailSentAt?: string;
  createdAt: string;
}

/** Generate an invoice from an enrollment's accrued usage over a window. */
export interface FromUsageInput {
  /** Enrollment id (from `products.enroll`) — the id usage is keyed on. */
  customerId: string;
  /** Window start (ISO 8601). */
  from: string;
  /** Window end (ISO 8601). */
  to: string;
  /** Finalize + email the invoice (fires invoice.sent). */
  send?: boolean;
}

export class InvoicesResource {
  constructor(private readonly t: Transport) {}

  create(input: CreateInvoiceRequest, idempotencyKey?: string): Promise<Invoice> {
    return this.t.request("POST", "/billing/invoices", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  /**
   * Roll an enrollment's accrued metered usage over `[from, to)` into a finalized
   * invoice — the subscription-free usage→invoice path. Rated against the product's
   * current published version (or a per-customer rate card). Rejects (422) when the
   * window has no billable usage. `send` finalizes + emails it.
   */
  fromUsage(input: FromUsageInput, idempotencyKey?: string): Promise<Invoice> {
    return this.t.request("POST", "/billing/invoices/from-usage", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Purchase a product: enroll the customer + open a finalized, product-linked invoice. */
  createForProduct(
    productId: string,
    input: CreateProductInvoiceRequest,
    idempotencyKey?: string,
  ): Promise<Invoice> {
    return this.t.request("POST", `/billing/products/${enc(productId)}/invoices`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  async list(): Promise<Invoice[]> {
    const res = await this.t.request<{ invoices?: Invoice[] }>("GET", "/billing/invoices", {
      requireSecret: true,
    });
    return res.invoices ?? [];
  }

  get(invoiceId: string): Promise<Invoice> {
    return this.t.request("GET", `/billing/invoices/${enc(invoiceId)}`, { requireSecret: true });
  }

  /** Finalize + email the invoice (fires invoice.sent). */
  send(invoiceId: string, idempotencyKey?: string): Promise<Invoice> {
    return this.t.request("POST", `/billing/invoices/${enc(invoiceId)}/send`, {
      requireSecret: true,
      idempotencyKey,
    });
  }

  void(invoiceId: string, idempotencyKey?: string): Promise<Invoice> {
    return this.t.request("POST", `/billing/invoices/${enc(invoiceId)}/void`, {
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Initiate payment on an open invoice (pix | boleto | card). */
  charge(invoiceId: string, method: PaymentMethod, idempotencyKey?: string): Promise<Payment> {
    return this.t.request("POST", `/billing/invoices/${enc(invoiceId)}/charge`, {
      body: { method },
      requireSecret: true,
      idempotencyKey,
    });
  }

  /**
   * The download grants this invoice's payments produced — the tokenized links
   * fulfillment minted for a deliverable product.
   *
   * Empty until a payment confirms, and empty forever if the product has no
   * deliverable. Never a 404, so it is safe to poll: "not fulfilled yet" and
   * "wrong id" would otherwise be indistinguishable.
   *
   * Use this to serve the download from your own thank-you page rather than
   * depending on the buyer's inbox — the email can silently not happen (a buyer
   * with no email address still gets a grant).
   */
  async deliverable(invoiceId: string): Promise<DeliverableGrant[]> {
    const res = await this.t.request<{ grants?: DeliverableGrant[] }>(
      "GET",
      `/billing/invoices/${enc(invoiceId)}/deliverable`,
      { requireSecret: true },
    );
    return res.grants ?? [];
  }

  /** Roll a subscription period's usage into an invoice. */
  generateFromSubscription(subscriptionId: string, idempotencyKey?: string): Promise<Invoice> {
    return this.t.request(
      "POST",
      `/billing/subscriptions/${enc(subscriptionId)}/invoices`,
      { requireSecret: true, idempotencyKey },
    );
  }
}
