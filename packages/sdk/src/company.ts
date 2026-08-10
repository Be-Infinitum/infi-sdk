import type { BillingConfig } from "./billing-as-code.js";
import {
  companyFromIntent,
  type CompanyIntent,
  type CompanyIntentOptions,
} from "./company-intents.js";

/** @deprecated Prefer {@link CompanyConfig} — same shape, clearer name. */
export type { BillingConfig };

/** Declarative company config (identity apps + revenue + webhooks). */
export type CompanyConfig = BillingConfig;

/**
 * Author a typed company config (company as code — ADR 0004).
 *
 * Alias of `defineBilling`; prefer this name in new code.
 *
 * @example
 * ```ts
 * export default defineCompany({
 *   products: [...],
 *   apps: [{ slug: "crm", name: "CRM", allowedOrigins: [...], redirectUris: [...] }],
 * });
 * ```
 *
 * @example Intent
 * ```ts
 * export default defineCompany.fromIntent("crm");
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

