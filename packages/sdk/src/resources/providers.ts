import type { Transport } from "../http.js";

/** One provider's connection state for this tenant. */
export type ProviderConnection = {
  provider: string;
  /** `connected` | `pending_webhook` | `needs_reconnect` | … — see the API reference. */
  status: string;
  externalAccountId?: string;
  walletId?: string;
  webhookRegistered: boolean;
  webhookUrl?: string;
  webhookEvents?: string[];
  /** Browser-safe key, echoed back because it is public by design (Stripe only). */
  publishableKey?: string;
  connectedAt?: string;
  lastVerifiedAt?: string;
};

export type ProviderList = {
  connections: ProviderConnection[];
  /** Providers this deployment can connect (e.g. `["stripe", "asaas"]`). */
  supported: string[];
};

/**
 * Bring-your-own-provider connections — your own Stripe / Asaas account. The
 * money lands in your account; Beinfi never holds it.
 *
 * Only the READ paths live here, and they need `account:admin`. Connecting,
 * disconnecting and setting a webhook secret are dashboard-only, behind fresh
 * MFA — an API key must not be able to redirect where your money goes. The whole
 * surface is live-only: it 404s in sandbox, where a built-in test provider charges.
 */
export class ProvidersResource {
  constructor(private readonly t: Transport) {}

  /** Connection state per provider, plus what this deployment supports. */
  list(): Promise<ProviderList> {
    return this.t.request("GET", "/account/providers", { requireSecret: true });
  }

  /**
   * Re-check a stored credential against the provider. Use after the merchant
   * rotates a key, or when `status` is `needs_reconnect`.
   */
  verify(provider: string, idempotencyKey?: string): Promise<ProviderConnection> {
    return this.t.request("POST", `/account/providers/${encodeURIComponent(provider)}/verify`, {
      requireSecret: true,
      idempotencyKey,
    });
  }

  /**
   * "I don't have an account with this provider — help me." The one action
   * available to a merchant who cannot connect anything yet, so it is not gated.
   */
  requestHelp(input: { provider?: string; note?: string } = {}): Promise<{ status: string }> {
    return this.t.request("POST", "/account/providers/help", {
      body: input,
      requireSecret: true,
    });
  }
}
