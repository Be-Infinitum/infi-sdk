import type { BillingConfig } from "./billing-as-code.js";
import {
  companyFromIntent,
  type CompanyIntent,
  type CompanyIntentOptions,
} from "./company-intents.js";

/** @deprecated Prefer {@link CompanyConfig} — same shape, clearer name. */
export type { BillingConfig };

/** Declarative company config (catalog + webhooks). */
export type CompanyConfig = BillingConfig;

/**
 * Author a typed company config — company as code, applied with `infi.sync()`
 * (the server plans and applies it; see `toCompanyDocument` for the wire shape).
 *
 * Alias of `defineBilling`; prefer this name in new code.
 *
 * @example
 * ```ts
 * export default defineCompany({
 *   products: [...],
 *   webhooks: [{ url: "https://example.com/api/webhooks/infi", events: ["payment.confirmed"] }],
 * });
 * ```
 *
 * @example Intent
 * ```ts
 * export default defineCompany.fromIntent("usage-saas");
 * ```
 */
function defineCompanyFn(config: CompanyConfig): CompanyConfig {
  return config;
}

export const defineCompany: ((config: CompanyConfig) => CompanyConfig) & {
  fromIntent: (intent: CompanyIntent, options?: CompanyIntentOptions) => CompanyConfig;
} = Object.assign(defineCompanyFn, {
  fromIntent: companyFromIntent,
});

export {
  companyFromIntent,
  COMPANY_INTENTS,
  type CompanyIntent,
  type CompanyIntentOptions,
} from "./company-intents.js";

