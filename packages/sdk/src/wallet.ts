import type { Infi } from "./client.js";
import type { CreditSummary, ProductCustomer, SessionIntrospection } from "./types.js";
import { InfiError } from "./errors.js";

export interface WalletFromSessionOptions {
  /** Product natural key (e.g. "crm", "ai-chat"). */
  productKey: string;
  /** Grant this many credits on first enroll (prepaid). Decimal string. */
  starterCredits?: string;
}

export interface Wallet {
  /** Enrollment id — use for credits.*, meter(), track(), state(). */
  enrollmentId: string;
  /** Tenant customer id from the session (identity-linked). */
  customerId: string;
  email?: string;
  productId: string;
  productKey: string;
  enrollment: ProductCustomer;
  session: SessionIntrospection;
  /** Latest credit summary when readable; may be undefined. */
  balance?: CreditSummary;
}

/**
 * Resolve (or create) the billing wallet for a signed-in session.
 *
 * Hides the customer vs enrollment id footgun: agents pass a session token +
 * product key and get back `enrollmentId` for meter/credits.
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

  if (options.starterCredits) {
    await infi.customers.credits
      .grant(enrollmentId, { amount: options.starterCredits, reference: "starter" })
      .catch(() => {});
  }

  let balance: CreditSummary | undefined;
  try {
    balance = await infi.customers.credits.balance(enrollmentId);
  } catch {
    // non-prepaid products may not expose a wallet
  }

  return {
    enrollmentId,
    customerId,
    email: email ?? undefined,
    productId: product.id,
    productKey: options.productKey,
    enrollment,
    session,
    balance,
  };
}
