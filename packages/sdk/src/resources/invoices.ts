import type { Transport } from "../http.js";
import type {
  CreateInvoiceRequest,
  CreateProductInvoiceRequest,
  Invoice,
  Payment,
  PaymentMethod,
} from "../types.js";

const enc = encodeURIComponent;

export class InvoicesResource {
  constructor(private readonly t: Transport) {}

  create(input: CreateInvoiceRequest, idempotencyKey?: string): Promise<Invoice> {
    return this.t.request("POST", "/billing/invoices", {
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
  send(invoiceId: string): Promise<Invoice> {
    return this.t.request("POST", `/billing/invoices/${enc(invoiceId)}/send`, {
      requireSecret: true,
    });
  }

  void(invoiceId: string): Promise<Invoice> {
    return this.t.request("POST", `/billing/invoices/${enc(invoiceId)}/void`, {
      requireSecret: true,
    });
  }

  /** Initiate payment on an open invoice (pix | boleto | card). */
  charge(invoiceId: string, method: PaymentMethod): Promise<Payment> {
    return this.t.request("POST", `/billing/invoices/${enc(invoiceId)}/charge`, {
      body: { method },
      requireSecret: true,
    });
  }

  /** Roll a subscription period's usage into an invoice. */
  generateFromSubscription(subscriptionId: string): Promise<Invoice> {
    return this.t.request(
      "POST",
      `/billing/subscriptions/${enc(subscriptionId)}/invoices`,
      { requireSecret: true },
    );
  }
}
