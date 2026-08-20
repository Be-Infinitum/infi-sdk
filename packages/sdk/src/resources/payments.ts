import type { Transport } from "../http.js";
import type { Payment, Refund } from "../types.js";

const enc = encodeURIComponent;

/** What you decide about a refund. */
export interface RefundInput {
  /**
   * Decimal string. Omit for a full refund — which is also what an amount above
   * the payment total means (it is clamped, not rejected).
   */
  amount?: string;
  /** Free text kept on the refund record; the only place it is stored. */
  reason?: string;
  /**
   * Whether the buyer's digital-product download stops working.
   *
   * LEAVE IT OUT unless you mean to override. The default is derived from the
   * amount, and the derivation is what you want: a full refund revokes the
   * download, a partial one does not (R$5 back on a R$100 guide is goodwill, not
   * a cancellation).
   *
   * `false` on a full refund = refund the money, let them keep the file. `true`
   * on a partial refund = cut access anyway. Once revoked, the buyer's download
   * URL answers 410.
   */
  revokeAccess?: boolean;
}

/**
 * Payments as the merchant sees them — including sending money back.
 *
 * Refunding runs on the merchant's OWN connected provider account (BYOP), so it
 * only works for a payment that provider actually took.
 */
export class PaymentsResource {
  constructor(private readonly t: Transport) {}

  /** Every payment attempt for the tenant, newest first. */
  async list(filter: { status?: string; provider?: string; method?: string } = {}): Promise<Payment[]> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) q.set(k, v);
    const suffix = q.size > 0 ? `?${q}` : "";
    const res = await this.t.request<{ payments?: Payment[] }>("GET", `/billing/payments${suffix}`, {
      requireSecret: true,
    });
    return res.payments ?? [];
  }

  get(paymentId: string): Promise<Payment> {
    return this.t.request("GET", `/billing/payments/${enc(paymentId)}`, { requireSecret: true });
  }

  /** The payment attempts against one invoice (an invoice may need several). */
  async listForInvoice(invoiceId: string): Promise<Payment[]> {
    const res = await this.t.request<{ payments?: Payment[] }>(
      "GET",
      `/billing/invoices/${enc(invoiceId)}/payments`,
      { requireSecret: true },
    );
    return res.payments ?? [];
  }

  /**
   * Return captured funds. Only a CONFIRMED payment can be refunded.
   *
   * The returned Payment carries `refundedAmount` — read that, not `status`, to
   * tell a partial refund from a full one: a partial refund also sets `status` to
   * `"refunded"`.
   *
   * If the product had a deliverable, a full refund also turns off the buyer's
   * download link (see `revokeAccess`), and the grant returned by
   * `invoices.deliverable()` comes back with `revokedAt` set.
   */
  refund(paymentId: string, input: RefundInput = {}, idempotencyKey?: string): Promise<Payment> {
    return this.t.request("POST", `/billing/payments/${enc(paymentId)}/refund`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  /**
   * What was refunded against this payment, oldest first. `refundedAmount` on the
   * payment is the sum of these; this is where the individual amounts, dates and
   * reasons live — which is what a dispute or a support thread needs.
   */
  async refunds(paymentId: string): Promise<Refund[]> {
    const res = await this.t.request<{ refunds?: Refund[] }>(
      "GET",
      `/billing/payments/${enc(paymentId)}/refunds`,
      { requireSecret: true },
    );
    return res.refunds ?? [];
  }
}
