import type { components } from "../generated/openapi.js";

/** A charge attempt (mirrors the backend Payment). For pix, `pixPayload` is what
 *  the payer pays with and `pixExpiresAt` its expiry — in live it is the copy-paste
 *  EMV/brcode string; in sandbox it is our confirmation URL. **Render it as a QR
 *  either way** — a QR is a QR, so your rendering code does not change between
 *  modes.
 *
 *  For a "confirm as if I paid" button in a test harness, branch on
 *  `sandboxConfirmUrl`, which exists ONLY in sandbox. Never sniff
 *  `pixPayload.startsWith("http")`: it passes every test you run and silently does
 *  nothing for real buyers, since in live the payload is an EMV. `invoiceUrl` is the PSP hosted page. */
export type Payment = components["schemas"]["Payment"];

/** Public checkout invoice read: merchant display + the invoice (with status). */
export type CheckoutSession = components["schemas"]["CheckoutSession"];

/** Invoice returned after applying a coupon at checkout (discounted totals). */
export type Invoice = components["schemas"]["Invoice"];

export interface ApplyCouponArgs {
  slug: string;
  invoiceId: string;
  /** Coupon code (`^[A-Z0-9_-]{3,32}$`). */
  code: string;
}

export type ChargeMethod = "pix" | "boleto" | "card";

export interface GetInvoiceArgs {
  slug: string;
  invoiceId: string;
}

export interface ChargeArgs {
  slug: string;
  invoiceId: string;
  method: ChargeMethod;
  /**
   * @deprecated Accepted and ignored. **No `/pay/*` route honours an
   * idempotency key**, so sending one claimed a guarantee that did not exist:
   * the header was allowed through CORS and dropped. Worse, the middleware
   * could not help even if mounted — the three routes where a duplicate costs
   * money run outside a transaction, and the idempotency layer falls through
   * when there is none.
   *
   * What actually stops a double charge, and does so without this:
   * at most one pending charge per invoice (a second is `409
   * charge_in_progress`), and a repeated pix charge returns the *same* charge
   * with the same QR rather than opening another at the provider. A refresh or
   * a double click lands on both.
   *
   * Kept in the type so no caller breaks. It is no longer sent.
   */
  idempotencyKey?: string;
}

export interface WaitForPaidArgs extends GetInvoiceArgs {
  /** Poll interval in ms (default 3000). */
  intervalMs?: number;
  /** Give up after this many ms (default 600000 = 10 min). */
  timeoutMs?: number;
  /** Called with each polled session (e.g. to refresh a countdown). */
  onTick?: (session: CheckoutSession) => void;
  /** Abort the poll. */
  signal?: AbortSignal;
}

/**
 * PayResource — slug-based public checkout. No secret key: the `plink_…` token
 * or the invoice id IS the capability, so these routes take none. Rate limited
 * per IP, per link and per invoice.
 *
 * **It does not run in a merchant's page.** The claim of "per-tenant CORS" here
 * was true once and is not: that allowlist was removed with product auth (ADR
 * 0025), and the API's CORS list is now a process-global env allowlist. A page
 * on the merchant's own domain is refused. Use `@beinfi/checkout`, which frames
 * our own origin — or call this from your server.
 */
export class PayResource {
  constructor(private readonly baseUrl: string) {}

  private url(slug: string, path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}/pay/${encodeURIComponent(slug)}${path}`;
  }

  /** Read the public checkout invoice (merchant + invoice status). */
  async getInvoice({ slug, invoiceId }: GetInvoiceArgs): Promise<CheckoutSession> {
    const res = await fetch(this.url(slug, `/invoices/${encodeURIComponent(invoiceId)}`), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const { parseErrorResponse } = await import("../errors.js");
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as CheckoutSession;
  }

  /**
   * Create a charge. For pix the returned Payment carries `pixPayload` +
   * `pixExpiresAt`; for card it carries `clientSecret` + `publishableKey` of the
   * provider routing picked, which the browser confirms directly with that
   * provider.
   *
   * It deliberately takes NO raw card fields. Accepting a PAN here put it in the
   * merchant's DOM and then through our servers, which pulls both sides into PCI
   * scope; the card capture UI is being rebuilt as an embed that keeps the PAN
   * between the browser and the provider.
   */
  async charge({ slug, invoiceId, method }: ChargeArgs): Promise<Payment> {
    const res = await fetch(this.url(slug, `/invoices/${encodeURIComponent(invoiceId)}/charge`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Deliberately no Idempotency-Key: nothing on /pay/* honours one. See
        // the note on ChargeArgs.idempotencyKey for what protects a retry.
      },
      body: JSON.stringify({ method }),
    });
    if (!res.ok) {
      const { parseErrorResponse } = await import("../errors.js");
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as Payment;
  }

  /**
   * Apply a coupon code to a public checkout invoice, returning the discounted
   * invoice. Public — no secret key (runs in the buyer's browser).
   */
  async applyCoupon({ slug, invoiceId, code }: ApplyCouponArgs): Promise<Invoice> {
    const res = await fetch(this.url(slug, `/invoices/${encodeURIComponent(invoiceId)}/coupon`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const { parseErrorResponse } = await import("../errors.js");
      throw await parseErrorResponse(res);
    }
    return (await res.json()) as Invoice;
  }

  /**
   * Build the public deliverable download URL for a fulfillment token. Navigate
   * the browser here; the endpoint 302-redirects to the presigned file / link.
   */
  downloadUrl(slug: string, token: string): string {
    return this.url(slug, `/download/${encodeURIComponent(token)}`);
  }

  /**
   * Poll the invoice until it is paid (or timeout). Resolves true when paid,
   * false on timeout. For polling after showing a pix QR.
   */
  async waitForPaid(args: WaitForPaidArgs): Promise<boolean> {
    const { slug, invoiceId, intervalMs = 3000, timeoutMs = 600_000, onTick, signal } = args;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal?.aborted) return false;
      const session = await this.getInvoice({ slug, invoiceId });
      onTick?.(session);
      if (session.invoice?.status === "paid") return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }
}
