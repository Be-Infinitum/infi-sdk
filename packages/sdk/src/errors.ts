export class InfiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "InfiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Thrown by `infi.meter(...)` when the customer's credit balance is exhausted,
 * before the wrapped work runs (ADR 0010: enforcement at the request edge).
 * Catch it to return a 402 / upsell instead of doing the work for free.
 */
export class InsufficientCreditError extends InfiError {
  readonly customerId: string;
  readonly balance: string;

  constructor(customerId: string, balance: string) {
    super(`Customer ${customerId} has no credit (balance ${balance}).`, 402, "insufficient_credit");
    this.name = "InsufficientCreditError";
    this.customerId = customerId;
    this.balance = balance;
  }
}

export async function parseErrorResponse(res: Response): Promise<InfiError> {
  let message = res.statusText || "Request failed";
  let code: string | undefined;
  try {
    const body = (await res.json()) as {
      message?: string;
      code?: string;
      error?: { message?: string; code?: string };
    };
    message = body.message ?? body.error?.message ?? message;
    code = body.code ?? body.error?.code;
  } catch {
    // ignore JSON parse errors
  }
  return new InfiError(message, res.status, code);
}
