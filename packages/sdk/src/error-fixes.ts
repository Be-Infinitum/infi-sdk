/** Actionable hint agents and humans can run when an InfiError is thrown. */
export interface InfiErrorFix {
  command?: string;
  docs?: string;
  hint?: string;
}

/** Known error codes with agent-friendly remediation. */
export const INFI_ERROR_FIXES: Record<string, InfiErrorFix> = {
  missing_secret_key: {
    command: "infi claim create --json",
    hint: "Set INFI_SECRET_KEY to a sk_test_... or sk_live_... key, or run infi login.",
    docs: "AGENTS.md#credentials",
  },
  invalid_key: {
    hint: "Secret keys start with sk_test_ or sk_live_. Publishable keys (pk_) cannot call server APIs.",
    docs: "AGENTS.md#credentials",
  },
  missing_code: {
    hint: "Auth codes expire in 60s. Start a fresh login — do not reload an old /callback?code= tab.",
    docs: "AGENTS.md#auth-gotchas",
  },
  no_products_for_login: {
    command: "infi bootstrap --intent crm --json",
    hint: "Hosted login requires at least one product. Bootstrap or sync infi.company.ts first.",
    docs: "AGENTS.md#quick-start-preferred",
  },
  sync_drift_blocked: {
    command: "infi sync infi.company.ts --plan",
    hint: "Dashboard changed since last sync. Run --plan to inspect, --force to overwrite, or infi pull to adopt.",
    docs: "AGENTS.md#company-as-code",
  },
  missing_slug: {
    hint: "Pass your tenant slug (INFI_TENANT_SLUG) — it is part of the public /pay/{slug} URL and cannot be inferred from a secret key.",
    docs: "AGENTS.md#credentials",
  },
  insufficient_credit: {
    hint: "Customer wallet is empty. Return 402 and surface checkout to buy a credit pack.",
    docs: "skills/add-prepaid-ai-chat/SKILL.md",
  },
};

export function fixForCode(code: string | undefined): InfiErrorFix | undefined {
  if (!code) return undefined;
  return INFI_ERROR_FIXES[code];
}
