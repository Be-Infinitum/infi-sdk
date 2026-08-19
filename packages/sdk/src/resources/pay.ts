import type { components } from "../generated/openapi.js";
import { newIdempotencyKey } from "../http.js";

/** A charge attempt (mirrors the backend Payment). For pix, `pixPayload` is what
 *  the payer pays with and `pixExpiresAt` its expiry — in live it is the copy-paste
 *  EMV/brcode string, so render the QR from it client-side; in sandbox it is a URL
 *  to the payment simulator, so link to it instead of QR-encoding it. Detect with
 *  `pixPayload.startsWith("http")`. `invoiceUrl` is the PSP hosted page. */
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
   * Idempotency key for this charge. Omit and one is generated per call, which
   * protects against a network retry but NOT against a buyer clicking Buy twice —
   * a second click is a second call and gets a second key. To collapse the double
   * click, derive this from something stable about the purchase intent.
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
 * PayResource — browser-safe, slug-based public checkout. No secret key: it hits
 * the public `/pay/{slug}/*` endpoints (per-tenant CORS + rate limited), so it
 * can run in the tenant's end-customer browser. For headless integrations and
 * whatever UI you build on top.
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
   * provider. Idempotency-Key is auto-generated.
   *
   * It deliberately takes NO raw card fields. Accepting a PAN here put it in the
   * merchant's DOM and then through our servers, which pulls both sides into PCI
   * scope; the card capture UI is being rebuilt as an embed that keeps the PAN
   * between the browser and the provider.
   */
  async charge({ slug, invoiceId, method, idempotencyKey }: ChargeArgs): Promise<Payment> {
    const res = await fetch(this.url(slug, `/invoices/${encodeURIComponent(invoiceId)}/charge`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey ?? newIdempotencyKey(),
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
