import type { Transport } from "../http.js";

export type BuyerTokenScope = "portal:read" | "portal:write";

export interface VerifiedBuyerToken {
  valid: boolean;
  origin?: "code" | "merchant";
  scope?: BuyerTokenScope;
  expiresAt?: string;
  /** The person, as your server knows them: use `externalId` for your own records. */
  customer?: { id: string; externalId: string; email?: string };
}

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

  /**
   * Who owns a token your app received from the element (ADR 0007: the
   * customer login for any of your apps). Checked on every call, so a
   * sign-out stops it at once. Expired, revoked, unknown and another store's
   * token all answer `valid: false`.
   */
  verify(token: string, idempotencyKey?: string): Promise<VerifiedBuyerToken> {
    return this.t.request("POST", "/v1/buyer-tokens/verify", { body: { token }, requireSecret: true, idempotencyKey });
  }

  /** Whether a first login by a new e-mail creates the customer (on by default). */
  loginSettings(): Promise<{ signupByLogin: boolean }> {
    return this.t.request("GET", "/v1/customer-login/settings", { requireSecret: true });
  }

  setLoginSettings(input: { signupByLogin: boolean }, idempotencyKey?: string): Promise<{ signupByLogin: boolean }> {
    return this.t.request("PUT", "/v1/customer-login/settings", { body: input, requireSecret: true, idempotencyKey });
  }
}
