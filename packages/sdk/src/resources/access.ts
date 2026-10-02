import type { Transport } from "../http.js";

const enc = encodeURIComponent;

export type AccessWindow = "lifetime" | "subscription" | "days";

export interface AccessKey {
  id: string;
  /** Your handle: lowercase letters, digits and hyphens ("curso-x"). */
  key: string;
  name: string;
  createdAt: string;
}

/** What buying a product grants. */
export interface AccessRule {
  key: string;
  window: AccessWindow;
  /** Required for `days`. */
  days?: number;
  name?: string;
}

export interface AccessGrant {
  id: string;
  key: string;
  keyName: string;
  customerId: string;
  source: "purchase" | "manual";
  window: AccessWindow;
  startsAt: string;
  expiresAt?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  reason?: string;
  revokedAt?: string;
  revokedReason?: "refunded" | "charged_back" | "manual";
  state: "active" | "past_due" | "ended";
}

/** One key as one person holds it: every grant folded. What a gate reads. */
export interface KeyAccess {
  key: string;
  name: string;
  hasAccess: boolean;
  /** `past_due` still has access, with a warning. */
  state: "active" | "past_due" | "ended";
  /** When the earliest live grant started (a course's drip counts from here). */
  since?: string;
  until?: string;
  /** expired, refunded, charged_back, manual, or subscription_<status>. */
  endedReason?: string;
  grants: AccessGrant[];
}

/**
 * Access keys (chave de acesso): a product grants keys over a window
 * (lifetime, while the subscription is live, N days); a course, a community
 * or a feature of your app asks whether a customer holds one now. Purchases
 * grant and full refunds/chargebacks revoke on their own; `grant`/`revoke`
 * are your exceptions, audited. Server-side, `sk_`.
 */
export class AccessResource {
  constructor(private readonly t: Transport) {}

  async listKeys(): Promise<AccessKey[]> {
    return (await this.t.request<{ keys: AccessKey[] }>("GET", "/access-keys", { requireSecret: true })).keys;
  }

  createKey(input: { key: string; name: string }, idempotencyKey?: string): Promise<AccessKey> {
    return this.t.request("POST", "/access-keys", { body: input, requireSecret: true, idempotencyKey });
  }

  renameKey(key: string, name: string, idempotencyKey?: string): Promise<AccessKey> {
    return this.t.request("PATCH", `/access-keys/${enc(key)}`, { body: { name }, requireSecret: true, idempotencyKey });
  }

  /** Everyone ever granted a key, and whether it holds now. */
  async holders(key: string): Promise<(KeyAccess & { customerId: string; externalId: string })[]> {
    return (await this.t.request<{ holders: (KeyAccess & { customerId: string; externalId: string })[] }>(
      "GET", `/access-keys/${enc(key)}/holders`, { requireSecret: true },
    )).holders;
  }

  async productRules(productId: string): Promise<AccessRule[]> {
    return (await this.t.request<{ rules: AccessRule[] }>("GET", `/products/${enc(productId)}/access`, {
      requireSecret: true,
    })).rules;
  }

  /** Replaces what buying the product grants. Grants already made keep their window. */
  async setProductRules(productId: string, rules: AccessRule[], idempotencyKey?: string): Promise<AccessRule[]> {
    return (await this.t.request<{ rules: AccessRule[] }>("PUT", `/products/${enc(productId)}/access`, {
      body: { rules },
      requireSecret: true,
      idempotencyKey,
    })).rules;
  }

  /** A bonus or a support case. `days` omitted is lifetime. The reason is audited. */
  grant(input: { externalId: string; key: string; days?: number; reason: string }, idempotencyKey?: string): Promise<AccessGrant> {
    return this.t.request("POST", "/access-grants", { body: input, requireSecret: true, idempotencyKey });
  }

  revoke(grantId: string, reason: string, idempotencyKey?: string): Promise<AccessGrant> {
    return this.t.request("POST", `/access-grants/${enc(grantId)}/revoke`, {
      body: { reason },
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Every key one of your customers holds or held. */
  async forCustomer(externalId: string): Promise<KeyAccess[]> {
    return (await this.t.request<{ access: KeyAccess[] }>("GET", `/access/customers/${enc(externalId)}`, {
      requireSecret: true,
    })).access;
  }

  /**
   * The gate: does this customer hold this key now? An unknown key throws
   * (404), so a typo never reads as "no access".
   */
  check(externalId: string, key: string): Promise<KeyAccess> {
    return this.t.request("GET", `/access/customers/${enc(externalId)}/keys/${enc(key)}`, { requireSecret: true });
  }
}
