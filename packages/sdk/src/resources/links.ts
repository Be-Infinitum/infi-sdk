import { InfiError, requireSlug } from "../errors.js";
import type { Transport } from "../http.js";
import type { InlineProductSpec, PaymentLink } from "../types.js";

const enc = encodeURIComponent;

/** A created link plus the URL you actually send someone. */
export type PaymentLinkWithUrl = PaymentLink & { url: string };

export type CreateLinkOptions = {
  /** Your tenant slug — part of the public URL. */
  slug: string;
  /** Absolute http(s). The payer lands here after paying: `?status=success&invoice=…`. */
  successUrl?: string;
  /** Absolute http(s). "Back to the merchant" while open; `?status=error&code=…` from the embed. */
  cancelUrl?: string;
};

/**
 * Create a link and define its product in the same call.
 *
 * No `slug`: your secret key already says which tenant you are, and the URL
 * comes back from the server.
 */
export type CreateLinkWithProductOptions = {
  /**
   * The product, resolved by its natural `key`. A new key creates it; a known
   * one reuses it, and pricing that differs publishes a new version.
   *
   * Every call mints a NEW link, and each link keeps selling the version it was
   * created against — so a later price change never reaches a link you already
   * shared.
   */
  product: InlineProductSpec;
  successUrl?: string;
  cancelUrl?: string;
  /** Deduplicates intent. Retries are already safe without it. */
  idempotencyKey?: string;
};

/** Discriminates the two call shapes. Kept separate and pure so it is testable
 *  on its own, like wallet.ts's parseAmountArgs. */
function isWithProduct(
  arg: string | CreateLinkWithProductOptions,
): arg is CreateLinkWithProductOptions {
  return typeof arg === "object" && arg !== null && "product" in arg;
}

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
   * infer it from a secret key alone. Throws `missing_slug` (400) when it is
   * empty, checked before the link is created.
   *
   * `successUrl` is where the hosted checkout sends the payer after paying,
   * with `?status=success&invoice=…` appended; `cancelUrl` is offered as "back
   * to the merchant" while the checkout is open, and is where the embed sends
   * them with `?status=error&code=…` when the charge expires. Both must be
   * absolute http(s) URLs — the API answers 422 otherwise. Omit both and the
   * payer stays on our receipt.
   */
  async create(input: CreateLinkWithProductOptions): Promise<PaymentLinkWithUrl>;
  async create(
    productId: string,
    opts: CreateLinkOptions,
    idempotencyKey?: string,
  ): Promise<PaymentLinkWithUrl>;
  async create(
    a: string | CreateLinkWithProductOptions,
    b?: CreateLinkOptions,
    c?: string,
  ): Promise<PaymentLinkWithUrl> {
    if (isWithProduct(a)) return this.#createWithProduct(a);
    return this.#createForProductId(a, b as CreateLinkOptions, c);
  }

  /** The inline-product form. The server resolves the product, publishes a
   *  version, mints the link and hands back the payer URL. */
  async #createWithProduct(input: CreateLinkWithProductOptions): Promise<PaymentLinkWithUrl> {
    const link = await this.t.request<PaymentLink & { url?: string }>("POST", "/metering/payment-links", {
      requireSecret: true,
      idempotencyKey: input.idempotencyKey,
      body: {
        product: input.product,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      },
    });
    if (!link.url) {
      // The whole point of this form is not needing a slug to build the URL. A
      // response without one means the API is older than this SDK, and guessing
      // would hand back an address we cannot vouch for.
      throw new InfiError(
        "links.create({ product }) needs an API that returns the link `url`; this one did not.",
        502,
        "invalid_response",
      );
    }
    return { ...link, url: link.url };
  }

  async #createForProductId(
    productId: string,
    opts: CreateLinkOptions,
    idempotencyKey?: string,
  ): Promise<PaymentLinkWithUrl> {
    const slug = requireSlug(opts?.slug, "links.create");
    const body =
      opts.successUrl || opts.cancelUrl
        ? { successUrl: opts.successUrl, cancelUrl: opts.cancelUrl }
        : undefined;
    const link = await this.t.request<PaymentLink & { url?: string }>(
      "POST",
      `/metering/products/${enc(productId)}/payment-links`,
      { requireSecret: true, idempotencyKey, body },
    );
    // Prefer the server's URL now that it sends one; fall back to building it
    // locally so this overload keeps working against an older API.
    return { ...link, url: link.url || this.urlFor(slug, link.token!) };
  }

  /** List a product's links. Without a `slug` each `url` is `""` — never a broken URL. */
  async list(productId: string, opts?: { slug?: string }): Promise<PaymentLinkWithUrl[]> {
    const res = await this.t.request<{ links?: PaymentLink[] }>(
      "GET",
      `/metering/products/${enc(productId)}/payment-links`,
      { requireSecret: true },
    );
    const slug = opts?.slug?.trim();
    return (res.links ?? []).map((l) => ({
      ...l,
      url: slug ? this.urlFor(slug, l.token!) : "",
    }));
  }

  /**
   * Revoke a link. Permanent, and the token stops resolving immediately —
   * invoices already created from it stay payable, so a buyer who is mid-
   * checkout does not lose the charge they are holding.
   */
  revoke(productId: string, linkId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request(
      "DELETE",
      `/metering/products/${enc(productId)}/payment-links/${enc(linkId)}`,
      { requireSecret: true, idempotencyKey },
    );
  }

  /** The payer-facing URL for a token. Throws `missing_slug` (400) on an empty slug. */
  urlFor(slug: string, token: string): string {
    return `${this.appBase}/pay/${enc(requireSlug(slug, "links.urlFor"))}/links/${enc(token)}`;
  }
}
