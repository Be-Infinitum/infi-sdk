import type { Transport } from "../http.js";
import type { Tenant } from "../types.js";

/**
 * What a buyer is told they are paying. `name` is the merchant name on the hosted
 * checkout and payment link, and it starts as a placeholder — a cold-start test
 * shipped a whole store whose checkout said "New app", found no way to change it
 * in the docs or the SDK, and had to guess this route from the HTTP reference.
 */
export interface UpdateAccountInput {
  /** Merchant name the buyer sees at checkout. */
  name?: string;
  /**
   * Absolute `https://` URL of your terms of use, quoted in the payment mandate.
   * An empty string clears it.
   */
  termsUrl?: string;
}

export class AccountResource {
  constructor(private readonly t: Transport) {}

  /** The authenticated tenant: slug, name, terms URL, status. */
  get(): Promise<Tenant> {
    return this.t.request("GET", "/account/tenant", { requireSecret: true });
  }

  /**
   * Set what the buyer sees. Takes effect immediately on the hosted checkout and
   * on every payment link — no re-publish, no new link.
   */
  update(input: UpdateAccountInput, idempotencyKey?: string): Promise<Tenant> {
    return this.t.request("PATCH", "/account/tenant", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }
}
