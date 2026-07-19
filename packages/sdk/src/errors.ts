import type { InfiErrorFix } from "./error-fixes.js";
import { fixForCode } from "./error-fixes.js";

export type { InfiErrorFix } from "./error-fixes.js";
export { INFI_ERROR_FIXES, fixForCode } from "./error-fixes.js";

export class InfiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Actionable remediation for agents and tooling (CLI, MCP). */
  readonly fix?: InfiErrorFix;

  constructor(message: string, status: number, code?: string, fix?: InfiErrorFix) {
    super(message);
    this.name = "InfiError";
    this.status = status;
    this.code = code;
    this.fix = fix ?? fixForCode(code);
  }

  /** JSON shape for `--json` CLI output and MCP tools. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      fix: this.fix,
    };
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
