import type { Transport } from "../http.js";
import type { PaymentLink } from "../types.js";

const enc = encodeURIComponent;

/** A created link plus the URL you actually send someone. */
export type PaymentLinkWithUrl = PaymentLink & { url: string };

/**
 * Payment links — the shortest path from "I have a product" to "someone paid me".
 *
 * A link is a shareable URL bound to a product. The payer opens it, fills in
 * their own details and pays; the customer and the invoice are materialized on
 * submit. Nothing is required on your side: no checkout page, no card input, no
 * PCI scope, no provider SDK. Which provider takes the money is decided by our
 * routing when the payer pays, not when you create the link.
 */
export class LinksResource {
  constructor(
    private readonly t: Transport,
    /** Hosted checkout origin, so create() can hand back a ready URL. */
    private readonly appBase: string,
  ) {}

  /**
   * Create a link for a product and return it with its shareable `url`.
   *
   * `slug` is your tenant slug — it is part of the public URL, so the SDK cannot
   * infer it from a secret key alone.
   */
  async create(
    productId: string,
    opts: { slug: string },
    idempotencyKey?: string,
  ): Promise<PaymentLinkWithUrl> {
    const link = await this.t.request<PaymentLink>(
      "POST",
      `/metering/products/${enc(productId)}/payment-links`,
      { requireSecret: true, idempotencyKey },
    );
    return { ...link, url: this.urlFor(opts.slug, link.token!) };
  }

  async list(productId: string, opts?: { slug?: string }): Promise<PaymentLinkWithUrl[]> {
    const res = await this.t.request<{ links?: PaymentLink[] }>(
      "GET",
      `/metering/products/${enc(productId)}/payment-links`,
      { requireSecret: true },
    );
    return (res.links ?? []).map((l) => ({
      ...l,
      url: opts?.slug ? this.urlFor(opts.slug, l.token!) : "",
    }));
  }

  /**
   * Revoke a link. Permanent, and the token stops resolving immediately —
   * invoices already created from it stay payable, so a buyer who is mid-
   * checkout does not lose the charge they are holding.
   */
  revoke(productId: string, linkId: string): Promise<void> {
    return this.t.request(
      "DELETE",
      `/metering/products/${enc(productId)}/payment-links/${enc(linkId)}`,
      { requireSecret: true },
    );
  }

  /** The payer-facing URL for a token. */
  urlFor(slug: string, token: string): string {
    return `${this.appBase}/pay/${enc(slug)}/links/${enc(token)}`;
  }
}
