import type { Transport } from "../http.js";
import type {
  CreateCustomerRequest,
  CreditSummary,
  Customer,
  CustomerState,
  GrantCreditInput,
  PriceInput,
  RateCard,
} from "../types.js";

const enc = encodeURIComponent;

class RateCardsResource {
  constructor(private readonly t: Transport) {}

  /** Set a per-customer price override (same shape as a plan price). */
  set(customerId: string, input: PriceInput, idempotencyKey?: string): Promise<RateCard> {
    return this.t.request("POST", `/metering/customers/${enc(customerId)}/rate-cards`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  async list(customerId: string): Promise<RateCard[]> {
    const res = await this.t.request<{ rateCards?: RateCard[] }>(
      "GET",
      `/metering/customers/${enc(customerId)}/rate-cards`,
      { requireSecret: true },
    );
    return res.rateCards ?? [];
  }

  delete(customerId: string, rateCardId: string): Promise<void> {
    return this.t.request(
      "DELETE",
      `/metering/customers/${enc(customerId)}/rate-cards/${enc(rateCardId)}`,
      { requireSecret: true },
    );
  }
}

class CreditsResource {
  constructor(private readonly t: Transport) {}

  /** Read the customer's credit balance + ledger. */
  balance(customerId: string): Promise<CreditSummary> {
    return this.t.request("GET", `/metering/customers/${enc(customerId)}/credit`, {
      requireSecret: true,
    });
  }

  /** Grant credit (e.g. after a credit-pack payment is confirmed). */
  grant(customerId: string, input: GrantCreditInput, idempotencyKey?: string): Promise<CreditSummary> {
    return this.t.request("POST", `/metering/customers/${enc(customerId)}/credit`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Consume (deduct) credit; rejects (409) if it would overdraw the balance. */
  consume(customerId: string, input: GrantCreditInput, idempotencyKey?: string): Promise<CreditSummary> {
    return this.t.request("POST", `/metering/customers/${enc(customerId)}/credit/consume`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }
}

export class CustomersResource {
  readonly rateCards: RateCardsResource;
  readonly credits: CreditsResource;

  constructor(private readonly t: Transport) {
    this.rateCards = new RateCardsResource(t);
    this.credits = new CreditsResource(t);
  }

  create(input: CreateCustomerRequest, idempotencyKey?: string): Promise<Customer> {
    return this.t.request("POST", "/metering/customers", {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  get(customerId: string): Promise<Customer> {
    return this.t.request("GET", `/metering/customers/${enc(customerId)}`, { requireSecret: true });
  }

  /**
   * One-read customer view: enrollment, credit balance, live subscriptions, and
   * current-period usage. Powers dashboards/panels; the credit gate uses the
   * lighter `credits.balance` instead.
   */
  state(customerId: string): Promise<CustomerState> {
    return this.t.request("GET", `/metering/customers/${enc(customerId)}/state`, {
      requireSecret: true,
    });
  }
}
