import type { Transport } from "../http.js";
import type { Subscription, SubscriptionPeriod } from "../types.js";

const enc = encodeURIComponent;

export interface CreateSubscriptionInput {
  /** Enrollment id (`ProductCustomer.id`) — NOT the tenant customer id. */
  enrollmentId: string;
  /**
   * Period anchor. Defaults to now on the backend. Pass a past timestamp to
   * backdate the first period (e.g. so a monthly period is already ended and can
   * be invoiced immediately).
   */
  anchor?: string;
  /** Bind to a specific published version. Defaults to the latest published. */
  productVersionId?: string;
}

/** A subscription plus the period the create call opened. */
export interface SubscriptionWithPeriod {
  subscription: Subscription;
  period: SubscriptionPeriod;
}

export class SubscriptionsResource {
  constructor(private readonly t: Transport) {}

  /** Create a subscription for an enrollment (opens its first billing period). */
  create(
    productId: string,
    input: CreateSubscriptionInput,
    idempotencyKey?: string,
  ): Promise<SubscriptionWithPeriod> {
    return this.t.request("POST", `/billing/products/${enc(productId)}/subscriptions`, {
      body: {
        customerId: input.enrollmentId,
        anchor: input.anchor,
        productVersionId: input.productVersionId,
      },
      requireSecret: true,
      idempotencyKey,
    });
  }

  get(subscriptionId: string): Promise<Subscription> {
    return this.t.request("GET", `/billing/subscriptions/${enc(subscriptionId)}`, {
      requireSecret: true,
    });
  }

  /** List an enrollment's subscriptions. */
  async listForCustomer(enrollmentId: string): Promise<Subscription[]> {
    const res = await this.t.request<{ subscriptions?: Subscription[] }>(
      "GET",
      `/billing/customers/${enc(enrollmentId)}/subscriptions`,
      { requireSecret: true },
    );
    return res.subscriptions ?? [];
  }
}
