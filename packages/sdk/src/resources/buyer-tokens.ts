import type { Transport } from "../http.js";

export type BuyerTokenScope = "portal:read" | "portal:write";

export interface BuyerToken {
  /** Opaque `bt_…`, shown once. Hand it to the PortalElement; never store it in the bundle or the URL. */
  token: string;
  expiresAt: string;
  origin: "merchant";
  scope: BuyerTokenScope;
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

  /** Sign the user out of the portal now (they logged out of your site). */
  revoke(input: { externalId: string }, idempotencyKey?: string): Promise<{ revoked: number }> {
    return this.t.request("POST", "/v1/buyer-tokens/revoke", { body: input, requireSecret: true, idempotencyKey });
  }
}
