import type { InfiErrorFix } from "./error-fixes.js";
import { fixForCode } from "./error-fixes.js";

export type { InfiErrorFix } from "./error-fixes.js";
export { INFI_ERROR_FIXES, fixForCode } from "./error-fixes.js";

/**
 * One field-level problem from a validation error (the API's `errors[]`), e.g.
 * `{ field: "productId", description: "product has no published version" }`.
 */
export interface InfiFieldIssue {
  /** Request field the problem is about, when the API names one. */
  field?: string;
  /** What is wrong with it, in words you can show a user. */
  description?: string;
}

export class InfiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Actionable remediation for agents and tooling (CLI, MCP). */
  readonly fix?: InfiErrorFix;
  /**
   * Per-field validation details. Empty unless the API returned `errors[]`
   * (typically a 422) — that is where the reason a write was rejected lives.
   */
  readonly errors: InfiFieldIssue[];
  /**
   * The API's `tracer_id` for this response. It is the one handle support can use
   * to find the request in our logs, so it is surfaced rather than dropped —
   * without it a user reporting a 500 has nothing to hand over.
   */
  readonly tracerId?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    fix?: InfiErrorFix,
    errors?: InfiFieldIssue[],
    tracerId?: string,
  ) {
    super(message);
    this.name = "InfiError";
    this.status = status;
    this.code = code;
    this.fix = fix ?? fixForCode(code);
    this.errors = errors ?? [];
    this.tracerId = tracerId;
  }

  /** JSON shape for `--json` CLI output and MCP tools. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      fix: this.fix,
      errors: this.errors,
      tracerId: this.tracerId,
    };
  }
}

/**
 * Thrown by `infi.meter(...)` when the customer's credit balance is exhausted,
 * before the wrapped work runs. Catch it to return a 402 / upsell instead of
 * doing the work for free.
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

function normalizeIssues(raw: unknown): InfiFieldIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (typeof e === "string") return { description: e };
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        const field = o.field ?? o.name ?? o.path;
        // Live API says `description`; the contract says `message`. Accept both.
        const description = o.description ?? o.message ?? o.detail ?? o.reason;
        return {
          ...(typeof field === "string" ? { field } : {}),
          ...(typeof description === "string" ? { description } : {}),
        };
      }
      return {};
    })
    .filter((e) => e.field !== undefined || e.description !== undefined);
}

/**
 * Fold the first field detail into the top-level message. Validation responses
 * carry a generic "One or more fields are invalid." while the actionable
 * sentence sits in `errors[]` — a caller who only logs `err.message` needs it.
 */
function withFieldDetail(message: string, errors: InfiFieldIssue[]): string {
  const first = errors[0];
  if (!first?.description || message.includes(first.description)) return message;
  const detail = first.field ? `${first.field}: ${first.description}` : first.description;
  return `${message.replace(/\s*$/, "")} (${detail})`;
}

export async function parseErrorResponse(res: Response): Promise<InfiError> {
  let message = res.statusText || "Request failed";
  let code: string | undefined;
  let errors: InfiFieldIssue[] = [];
  let tracerId: string | undefined;
  try {
    const body = (await res.json()) as {
      message?: string;
      code?: string;
      /** Live API field name; the OpenAPI contract nests under `error` instead. */
      error_code?: string;
      errors?: unknown;
      tracer_id?: string;
      error?: { message?: string; code?: string; details?: unknown; request_id?: string };
    };
    message = body.message ?? body.error?.message ?? message;
    code = body.code ?? body.error_code ?? body.error?.code;
    errors = normalizeIssues(body.errors ?? body.error?.details);
    // Both envelopes carry it: flat handler responses use `tracer_id`, the
    // middleware ones nest it as `error.request_id`.
    tracerId = body.tracer_id ?? body.error?.request_id;
  } catch {
    // ignore JSON parse errors
  }
  return new InfiError(
    withFieldDetail(message, errors), res.status, code, undefined, errors, tracerId);
}

/**
 * Guard a tenant slug before it is interpolated into a public `/pay` URL.
 * Untyped callers used to get a URL containing the literal `undefined` and no
 * error at all, which only surfaced as a 404 for the buyer.
 */
/**
 * Require a CPF or CNPJ, checked for shape as well as presence.
 *
 * Presence alone is not enough: a truncated document passes a `!taxId` test and
 * then fails at the provider, which is the same late failure with an extra step.
 * 11 digits is a CPF, 14 a CNPJ — the same rule the public checkout session
 * enforces, so a caller cannot get past here and fail there.
 */
export function requireTaxId(taxId: string | undefined): string {
  const digits = (taxId ?? "").replace(/\D/g, "");
  if (digits.length !== 11 && digits.length !== 14) {
    throw new InfiError(
      "checkout: customer.taxId must be a CPF (11 digits) or CNPJ (14 digits). Pix and boleto are refused for a payer without one, and the refusal reaches the buyer's screen, not your logs.",
      400,
      "customer_tax_id_required",
    );
  }
  return digits;
}

export function requireSlug(slug: string | undefined | null, method: string): string {
  const trimmed = typeof slug === "string" ? slug.trim() : "";
  if (!trimmed) {
    throw new InfiError(
      `${method} requires a non-empty \`slug\` — your tenant slug, which is part of the public /pay URL.`,
      400,
      "missing_slug",
    );
  }
  return trimmed;
}
