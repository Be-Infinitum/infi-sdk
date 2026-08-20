/**
 * Actionable remediation attached to an `InfiError` as `err.fix`, for agents,
 * CLIs and humans. Every field is optional — read the ones you want, or
 * interpolate the whole thing:
 *
 * ```ts
 * catch (err) {
 *   if (err instanceof InfiError) console.error(`${err.message} — ${err.fix}`);
 * }
 * ```
 *
 * `${err.fix}` renders one line rather than `[object Object]`; `JSON.stringify`
 * still gives you the plain fields.
 */
export interface InfiErrorFix {
  /** A shell command that resolves it, ready to run. */
  command?: string;
  /** Public URL explaining it. Always a beinfi.com docs page, never a repo path. */
  docs?: string;
  /** One sentence on what to do, safe to show a user. */
  hint?: string;
}

/** One line: hint, then the command, then the docs URL — whichever exist. */
function describeFix(f: InfiErrorFix): string {
  return [f.hint, f.command && `Run: ${f.command}`, f.docs && `Docs: ${f.docs}`]
    .filter(Boolean)
    .join(" ");
}

/**
 * Attaches a NON-enumerable toString, so string interpolation is useful while
 * JSON.stringify (and InfiError.toJSON, which embeds this) keeps emitting the
 * plain object an agent parses.
 */
function withDescription(f: InfiErrorFix): InfiErrorFix {
  return Object.defineProperty({ ...f }, "toString", {
    value: () => describeFix(f),
    enumerable: false,
  });
}

const FIXES: Record<string, InfiErrorFix> = {
  missing_secret_key: {
    // NOT `infi claim create`, which is what this said and which PROVISIONS A NEW
    // TENANT. Two cold-start audits were told that while sitting in a project that
    // already had one, so the suggested fix would have abandoned the tenant holding
    // their product. A command that creates state is never the remedy for "I cannot
    // find your existing state".
    command: "infi doctor --json",
    hint: "Set INFI_SECRET_KEY, pass --key, or run from a directory whose .env.local has one. Run `infi login` to save a profile. Only run `infi bootstrap` if you have never provisioned — it creates a tenant.",
    docs: "https://beinfi.com/pt-br/docs/inicio-rapido",
  },
  invalid_key: {
    hint: "Secret keys start with sk_test_ or sk_live_. Publishable keys (pk_) cannot call server APIs.",
    docs: "https://beinfi.com/pt-br/docs/inicio-rapido",
  },
  missing_code: {
    hint: "Auth codes expire in 60s. Start a fresh login — do not reload an old /callback?code= tab.",
    docs: "https://beinfi.com/pt-br/docs/inicio-rapido",
  },
  no_products_for_login: {
    command: "infi bootstrap --intent crm --json",
    hint: "Hosted login requires at least one product. Bootstrap or sync infi.company.ts first.",
    docs: "https://beinfi.com/pt-br/docs/inicio-rapido",
  },
  sync_drift_blocked: {
    command: "infi sync infi.company.ts --plan",
    hint: "Dashboard changed since last sync. Run --plan to inspect, --force to overwrite, or infi pull to adopt.",
    docs: "https://beinfi.com/pt-br/docs/company-as-code",
  },
  missing_slug: {
    hint: "Pass your tenant slug (INFI_TENANT_SLUG) — it is part of the public /pay/{slug} URL and cannot be inferred from a secret key.",
    docs: "https://beinfi.com/pt-br/docs/inicio-rapido",
  },
  // Codes the live API really returns. Without these `InfiError.fix` was undefined
  // on every 401/404/422, while the docs tell agents to read it.
  validation_failed: {
    hint: "The rejected field and the reason are in err.errors[] — fix that field and retry.",
  },
  auth_001: {
    command: "infi doctor --json",
    hint: "The key was refused by this host. sk_test_ keys only work on api-sandbox.beinfi.com, sk_live_ only on api.beinfi.com.",
  },
  unauthorized: {
    command: "infi doctor --json",
    hint: "No usable credential reached the API. Pass a secretKey (or --key / INFI_SECRET_KEY).",
  },
  not_found: {
    hint: "The id does not exist on this tenant, or the key points at the other environment (sandbox vs live).",
  },
  insufficient_credit: {
    hint: "Customer wallet is empty. Return 402 and surface checkout to buy a credit pack.",
    docs: "https://beinfi.com/pt-br/docs/sdk",
  },
};

/** Known error codes with agent-friendly remediation. */
export const INFI_ERROR_FIXES: Record<string, InfiErrorFix> = Object.fromEntries(
  Object.entries(FIXES).map(([code, f]) => [code, withDescription(f)]),
);

export function fixForCode(code: string | undefined): InfiErrorFix | undefined {
  if (!code) return undefined;
  return INFI_ERROR_FIXES[code];
}
