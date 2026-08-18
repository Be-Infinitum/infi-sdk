import type { GlobalFlags } from "../lib/client.js";
import { apiBase, apiBaseOverride, appBase, infiClient, resolveSecretKey } from "../lib/client.js";
import { fixForCode, modeFromKey, resolveApiBase, type InfiErrorFix } from "@beinfi/sdk";
import pc from "picocolors";
import { die, ok, printJson } from "../lib/output.js";

export type DoctorCheck = {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: InfiErrorFix;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
};

function push(
  checks: DoctorCheck[],
  check: DoctorCheck,
): void {
  checks.push(check);
}

/** Detect common env mistakes. Hosts are inferred from the key — AUTH/PAY URLs are legacy. */
function checkEnvVars(checks: DoctorCheck[]): void {
  if (process.env.INFI_AUTH_BASE_URL || process.env.NEXT_PUBLIC_INFI_AUTH_BASE_URL) {
    push(checks, {
      id: "env_auth_legacy",
      status: "warn",
      message:
        "INFI_AUTH_BASE_URL is legacy — the SDK resolves the app host from the key. You can remove it.",
    });
  }
  if (process.env.INFI_PAY_BASE_URL || process.env.NEXT_PUBLIC_INFI_PAY_BASE_URL) {
    push(checks, {
      id: "env_pay_legacy",
      status: "warn",
      message:
        "INFI_PAY_BASE_URL is legacy — the SDK resolves the app host from the key. You can remove it.",
    });
  }

}

export async function runDoctor(flags: GlobalFlags): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  let secretKey: string;
  try {
    secretKey = resolveSecretKey(flags);
    if (!secretKey.startsWith("sk_")) {
      push(checks, {
        id: "secret_key",
        status: "fail",
        message: "INFI_SECRET_KEY must start with sk_test_ or sk_live_.",
        fix: fixForCode("invalid_key"),
      });
    } else {
      push(checks, {
        id: "secret_key",
        status: "pass",
        message: `Secret key present (${secretKey.startsWith("sk_test_") ? "sandbox" : "live"}).`,
      });
    }
  } catch {
    push(checks, {
      id: "secret_key",
      status: "fail",
      message: "No secret key. Set INFI_SECRET_KEY, pass --key, or run `infi login`.",
      fix: fixForCode("missing_secret_key"),
    });
    // A connected provider is the gate to real money (backend ADR 0012): without it
  // a charge has no account to land in. A live key with no provider is the failure
  // worth shouting about, so it fails there and only warns in sandbox.
  checkEnvVars(checks);
    return { ok: false, checks };
  }

  const base = apiBase(flags);
  const mode = modeFromKey(secretKey);
  const expected = resolveApiBase(mode);
  const override = apiBaseOverride(flags);
  if (base === expected) {
    push(checks, { id: "api_base", status: "pass", message: `API base: ${base} (${mode})` });
  } else if (override) {
    push(checks, {
      id: "api_base",
      status: "warn",
      message: `API base: ${base} — pinned by ${override.source}. A ${mode} key normally talks to ${expected}.`,
    });
  } else {
    // Reporting the wrong host as a pass is how a sandbox key ended up at the
    // live API: every call 401s and the provisioning endpoint 404s.
    push(checks, {
      id: "api_base",
      status: "fail",
      message: `API base ${base} does not serve ${mode} keys — expected ${expected}.`,
      fix: {
        hint: "Unset INFI_API_URL / drop --local, or re-run `infi login`; the host comes from the key prefix.",
      },
    });
  }

  const infi = infiClient({ ...flags, key: secretKey });

  try {
    const products = await infi.products.list();
    if (products.length === 0) {
      push(checks, {
        id: "products",
        status: "fail",
        message: "Zero products on tenant — hosted login resolves without a customer (infinite login loop).",
        fix: {
          command: "infi bootstrap --intent crm --json",
          hint: "Declare at least one product in infi.company.ts and sync (or re-run bootstrap).",
          docs: "AGENTS.md#mandatory-setup-order",
        },
      });
    } else {
      push(checks, {
        id: "products",
        status: "pass",
        message: `${products.length} product(s) configured.`,
      });
    }
  } catch (err) {
    push(checks, {
      id: "products",
      status: "fail",
      message: `Could not list products: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  try {
    const { connections, supported } = await infi.providers.list();
    const usable = connections.find((c) => c.status === "connected");
    const live = mode === "live";
    if (!usable) {
      push(checks, {
        id: "provider",
        status: live ? "fail" : "warn",
        message:
          connections.length === 0
            ? `No payment provider connected (supported: ${supported.join(", ") || "none"}) — charges have nowhere to land.`
            : `Provider ${connections[0]!.provider} is ${connections[0]!.status}, not connected.`,
        fix: {
          hint: "Connect it in the dashboard — it needs fresh MFA, so an API key cannot do it.",
          docs: `${appBase(flags)}/go-live`,
        },
      });
    } else if (!usable.webhookRegistered) {
      push(checks, {
        id: "provider",
        status: "warn",
        message: `${usable.provider} connected, but its webhook is not registered — you will not learn when a payment succeeds.`,
        fix: { docs: `${appBase(flags)}/go-live` },
      });
    } else {
      push(checks, {
        id: "provider",
        status: "pass",
        message: `${usable.provider} connected, webhook registered.`,
      });
    }
  } catch (err) {
    // /account/providers is live-only today; a sandbox 404 is expected, not a defect.
    const status = (err as { status?: number }).status;
    push(checks, {
      id: "provider",
      status: "warn",
      message:
        status === 404 && mode === "sandbox"
          ? "Provider connections are live-only — sandbox charges through the built-in sandbox provider."
          : `Could not read provider connections: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  checkEnvVars(checks);

  const ok = checks.every((c) => c.status !== "fail");
  return { ok, checks };
}

export async function doctorCommand(flags: GlobalFlags): Promise<void> {
  const result = await runDoctor(flags);

  if (flags.json) {
    printJson(result);
    if (!result.ok) process.exit(1);
    return;
  }

  for (const check of result.checks) {
    const icon =
      check.status === "pass" ? pc.green("✓") : check.status === "warn" ? pc.yellow("!") : pc.red("✗");
    console.log(`${icon} ${check.message}`);
    if (check.fix?.command) console.log(pc.dim(`  fix:  ${check.fix.command}`));
    if (check.fix?.hint) console.log(pc.dim(`  hint: ${check.fix.hint}`));
    if (check.fix?.docs) console.log(pc.dim(`  docs: ${check.fix.docs}`));
  }

  if (result.ok) ok("All checks passed.");
  else die("Doctor found blocking issues. Fix the items above and re-run `infi doctor`.");
}
