import type { Infi } from "./client.js";
import type { CreditSummary, ProductCustomer, SessionIntrospection } from "./types.js";
import { InfiError } from "./errors.js";

export type WalletGrantOn = "cycle" | "payment";

export interface WalletOpOptions {
  /** Ledger reference / reason (stored on the entry). */
  reason?: string;
  /** Safe retries — forwarded as Idempotency-Key. */
  idempotencyKey?: string;
}

export type WalletAmountInput =
  | { meter: string; amount: string; reason?: string; idempotencyKey?: string }
  | string; // amount only → uses defaultMeter

export interface MeterBalance {
  meter: string;
  balance: string;
  total?: string;
  /** Raw credit summary when the backend still uses the single-wallet shim. */
  summary: CreditSummary;
}

/**
 * Bound meter wallet for one enrollment (ADR 0005).
 *
 * Today the API is a single credit ledger — `debit`/`credit`/`balance` shim to
 * `credits.*` and tag the meter in `reference`. When the backend ships
 * per-meter routes, this client switches without changing app code.
 */
export interface BoundWallet {
  /** Enrollment id — billing subject for credits / meter / state. */
  enrollmentId: string;
  /** Default meter when amount-only sugar is used. */
  defaultMeter: string;

  debit(meter: string, amount: string, opts?: WalletOpOptions): Promise<MeterBalance>;
  debit(input: { meter: string; amount: string } & WalletOpOptions): Promise<MeterBalance>;

  credit(meter: string, amount: string, opts?: WalletOpOptions): Promise<MeterBalance>;
  credit(input: { meter: string; amount: string } & WalletOpOptions): Promise<MeterBalance>;

  /** One meter (default: `defaultMeter`) or pass a meter key. */
  balance(meter?: string): Promise<MeterBalance>;
}

export interface WalletFromSessionOptions {
  /** Product natural key (e.g. "crm", "ai-chat"). */
  productKey: string;
  /**
   * Grant this many units on first enroll (shim: credits.grant).
   * Prefer plan `grants[]` once the backend applies them.
   */
  starterCredits?: string;
  /** Meter key for starterCredits / amount-only sugar. Default `"tokens"`. */
  defaultMeter?: string;
}

export interface Wallet extends BoundWallet {
  /** Tenant customer id from the session (identity-linked). */
  customerId: string;
  email?: string;
  productId: string;
  productKey: string;
  enrollment: ProductCustomer;
  session: SessionIntrospection;
  /** Snapshot taken at fromSession; prefer `balance(meter)`. */
  summary?: CreditSummary;
}

function parseAmountArgs(
  a: string | ({ meter: string; amount: string } & WalletOpOptions),
  b?: string,
  c?: WalletOpOptions,
  defaultMeter = "tokens",
): { meter: string; amount: string; opts: WalletOpOptions } {
  if (typeof a === "object") {
    return {
      meter: a.meter,
      amount: a.amount,
      opts: { reason: a.reason, idempotencyKey: a.idempotencyKey },
    };
  }
  if (b === undefined) {
    // amount-only sugar: debit("120")
    return { meter: defaultMeter, amount: a, opts: c ?? {} };
  }
  return { meter: a, amount: b, opts: c ?? {} };
}

function toMeterBalance(meter: string, summary: CreditSummary): MeterBalance {
  return {
    meter,
    balance: summary.balance ?? "0",
    total: summary.total,
    summary,
  };
}

/** Create a bound wallet for an enrollment you already have. */
export function bindWallet(
  infi: Infi,
  enrollmentId: string,
  options: { defaultMeter?: string } = {},
): BoundWallet {
  const defaultMeter = options.defaultMeter ?? "tokens";

  async function debit(
    a: string | ({ meter: string; amount: string } & WalletOpOptions),
    b?: string,
    c?: WalletOpOptions,
  ): Promise<MeterBalance> {
    const { meter, amount, opts } = parseAmountArgs(a, b, c, defaultMeter);
    const summary = await infi.customers.credits.consume(
      enrollmentId,
      { amount, reference: opts.reason ?? `meter:${meter}` },
      opts.idempotencyKey,
    );
    return toMeterBalance(meter, summary);
  }

  async function credit(
    a: string | ({ meter: string; amount: string } & WalletOpOptions),
    b?: string,
    c?: WalletOpOptions,
  ): Promise<MeterBalance> {
    const { meter, amount, opts } = parseAmountArgs(a, b, c, defaultMeter);
    const summary = await infi.customers.credits.grant(
      enrollmentId,
      { amount, reference: opts.reason ?? `meter:${meter}` },
      opts.idempotencyKey,
    );
    return toMeterBalance(meter, summary);
  }

  async function balance(meter: string = defaultMeter): Promise<MeterBalance> {
    const summary = await infi.customers.credits.balance(enrollmentId);
    return toMeterBalance(meter, summary);
  }

  return {
    enrollmentId,
    defaultMeter,
    debit: debit as BoundWallet["debit"],
    credit: credit as BoundWallet["credit"],
    balance,
  };
}

/**
 * Resolve (or create) the billing wallet for a signed-in session.
 *
 * Hides the customer vs enrollment id footgun: agents pass a session token +
 * product key and get back a wallet with `debit` / `credit` / `balance`.
 */
export async function walletFromSession(
  infi: Infi,
  sessionToken: string,
  options: WalletFromSessionOptions,
): Promise<Wallet> {
  const session = await infi.getSession(sessionToken);
  const customerId = session.customer?.id;
  if (!customerId) {
    throw new InfiError(
      "Session has no customer — sync a product (company as code) before login.",
      401,
      "no_products_for_login",
    );
  }

  const products = await infi.products.list();
  const product = products.find((p) => p.key === options.productKey);
  if (!product?.id) {
    throw new InfiError(
      `Product "${options.productKey}" not found — run infi sync / bootstrap.`,
      404,
      "no_products_for_login",
      {
        command: "infi bootstrap --intent prepaid-ai-chat --json",
        hint: `Declare product key "${options.productKey}" in infi.company.ts and sync.`,
      },
    );
  }

  const email = session.customer?.email ?? session.identity?.email ?? undefined;
  const enrollment = await infi.products.enroll(product.id, {
    externalId: customerId,
    email: email ?? undefined,
  });
  const enrollmentId = enrollment.id!;
  const defaultMeter = options.defaultMeter ?? "tokens";
  const bound = bindWallet(infi, enrollmentId, { defaultMeter });

  if (options.starterCredits) {
    await bound
      .credit({
        meter: defaultMeter,
        amount: options.starterCredits,
        reason: "starter",
        idempotencyKey: `starter:${enrollmentId}:${defaultMeter}`,
      })
      .catch(() => {});
  }

  let summary: CreditSummary | undefined;
  try {
    summary = (await bound.balance(defaultMeter)).summary;
  } catch {
    // non-prepaid products may not expose a wallet
  }

  return {
    ...bound,
    customerId,
    email: email ?? undefined,
    productId: product.id,
    productKey: options.productKey,
    enrollment,
    session,
    summary,
  };
}
