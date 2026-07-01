import type { Transport } from "../http.js";
import type { UsageReport } from "../types.js";

export interface UsageQuery {
  customerId: string;
  /** ISO date-time lower bound. */
  from?: string;
  /** ISO date-time upper bound. */
  to?: string;
}

export class UsageResource {
  constructor(private readonly t: Transport) {}

  /** Usage totals per meter for a customer over a window. */
  get(query: UsageQuery): Promise<UsageReport> {
    return this.t.request("GET", "/metering/usage", {
      query: { customerId: query.customerId, from: query.from, to: query.to },
      requireSecret: true,
    });
  }
}
