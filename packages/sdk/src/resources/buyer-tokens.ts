import type { Transport } from "../http.js";

export type BuyerTokenScope = "portal:read" | "portal:write";

export interface BuyerToken {
  /** Opaque `bt_…`, shown once. Hand it to the PortalElement; never store it in the bundle or the URL. */
  token: string;
  expiresAt: string;
  origin: "merchant";
  scope: BuyerTokenScope;
}

export interface BuyerAccess {
  productId: string;
  /** The manifest key (`ecommerce/ebook`), when the product has one. */
  key?: string;
  name: string;
  kind: "purchase" | "subscription";
  subscriptionStatus?: "active" | "trialing" | "past_due";
  renewsAt?: string;
  cancelAtPeriodEnd?: boolean;
}

/** Who a buyer token signs in at your store, and what they have there now. */
export interface VerifiedBuyer {
  buyer: { email?: string; name?: string; customerIds: string[]; externalIds: string[] };
  origin: "code" | "merchant";
  scope: BuyerTokenScope;
  expiresAt: string;
  access: BuyerAccess[];
}

/** Whether a verified buyer has a product, by manifest key or product id. */
export function buyerHas(v: Pick<VerifiedBuyer, "access"> | null | undefined, keyOrProductId: string): boolean {
  return !!v?.access.some((a) => a.key === keyOrProductId || a.productId === keyOrProductId);
}

/**
 * Buyer tokens — your server vouching for one of YOUR logged-in users so the
 * PortalElement opens their "Minhas compras" without Infi's e-mail code
 * (ADR 0006, path c). One hour; the element renews it through your getToken().
 *
 * `portal:read` (default) never acts. `portal:write` lets the user cancel,
 * change the card and ask for a refund without Infi's code — on your
 * responsibility, since you already authenticated them. Server-side only: an
 * `sk_` must never reach a browser.
 */
export class BuyerTokensResource {
  constructor(private readonly t: Transport) {}

  create(
    input: { externalId: string; scope?: BuyerTokenScope },
    idempotencyKey?: string,
  ): Promise<BuyerToken> {
    return this.t.request("POST", "/v1/buyer-tokens", { body: input, requireSecret: true, idempotencyKey });
  }

  /**
   * Who a `bt_` your page holds is, and what they have at your store: call it
   * before a gated page, every time (it is never cached). Throws an InfiError
   * with status 401 for an expired, revoked or foreign token.
   */
  verify(token: string): Promise<VerifiedBuyer> {
    return this.t.request("GET", "/v1/buyer-tokens/verify", {
      requireSecret: true,
      headers: { "X-Buyer-Token": token },
    });
  }

  /**
   * Sign out now: `{ externalId }` every token of that customer (they logged
   * out of your site), `{ token }` that one device's store login.
   */
  revoke(input: { externalId: string } | { token: string }, idempotencyKey?: string): Promise<{ revoked: number }> {
    return this.t.request("POST", "/v1/buyer-tokens/revoke", { body: input, requireSecret: true, idempotencyKey });
  }
}
