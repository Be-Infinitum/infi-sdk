import { InfiError } from "../errors.js";
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

  delete(customerId: string, rateCardId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request(
      "DELETE",
      `/metering/customers/${enc(customerId)}/rate-cards/${enc(rateCardId)}`,
      { requireSecret: true, idempotencyKey },
    );
  }
}

class CreditsResource {
  constructor(private readonly t: Transport) {}

  /**
   * A customer's wallet balance for one meter.
   *
   * Every balance belongs to a meter (`tokens`, `exports`, …). Without `meter`
   * this answers only when the wallet holds a single one, and throws
   * `meter_required` otherwise, rather than guessing which balance you meant.
   */
  async balance(customerId: string, meter?: string): Promise<CreditSummary> {
    if (meter) return this.meterBalance(customerId, meter);
    const res = await this.t.request<{ balances?: CreditSummary[] }>(
      "GET",
      `/customers/${enc(customerId)}/wallet`,
      { requireSecret: true },
    );
    const balances = res.balances ?? [];
    if (balances.length === 0) return { balance: "0", total: "0" };
    if (balances.length === 1) return balances[0]!;
    throw new InfiError(
      `Customer ${customerId} has balances on ${balances.length} meters; pass the meter to read.`,
      400,
      "meter_required",
      { hint: `Call credits.balance(customerId, meter) with one of: ${balances.map((b) => b.meter).join(", ")}.` },
    );
  }

  /** Balance of ONE meter's wallet. */
  meterBalance(customerId: string, meter: string): Promise<CreditSummary> {
    return this.t.request(
      "GET",
      `/customers/${enc(customerId)}/wallet?meter=${encodeURIComponent(meter)}`,
      { requireSecret: true },
    );
  }

  /** Add units to a meter's wallet (e.g. after a credit-pack payment is confirmed). */
  grant(customerId: string, input: GrantCreditInput, idempotencyKey?: string): Promise<CreditSummary> {
    return this.mutate("credit", customerId, input, idempotencyKey);
  }

  /**
   * Take units from a meter's wallet. Never refused for lack of balance: the
   * balance may go negative. Gate with `balance` / `assertCredit` before the
   * work if you need to stop at zero.
   */
  consume(customerId: string, input: GrantCreditInput, idempotencyKey?: string): Promise<CreditSummary> {
    return this.mutate("debit", customerId, input, idempotencyKey);
  }

  private mutate(
    op: "credit" | "debit",
    customerId: string,
    input: GrantCreditInput,
    idempotencyKey?: string,
  ): Promise<CreditSummary> {
    return this.t.request("POST", `/customers/${enc(customerId)}/wallet/${op}`, {
      body: {
        meter: input.meter,
        amount: input.amount,
        ...(input.reference ? { reason: input.reference } : {}),
        // The header makes a retry replay the response; the body key is what
        // stops the wallet itself from booking the entry twice. The wallet
        // refuses ':' in its key, which callers routinely use ("pay_1:tokens").
        ...(idempotencyKey ? { idempotencyKey: idempotencyKey.replaceAll(":", "_") } : {}),
      },
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
   * usage. Powers dashboards/panels; the credit gate uses the lighter
   * `credits.balance` instead.
   *
   * `period` scopes the usage window (RFC3339 `from`/`to`); omit it for the
   * current calendar month (the default).
   */
  state(customerId: string, period?: { from?: string; to?: string }): Promise<CustomerState> {
    return this.t.request("GET", `/metering/customers/${enc(customerId)}/state`, {
      query: period ? { from: period.from, to: period.to } : undefined,
      requireSecret: true,
    });
  }
}
