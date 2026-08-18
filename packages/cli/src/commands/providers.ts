import pc from "picocolors";
import type { GlobalFlags } from "../lib/client.js";
import { appBase, infiClient } from "../lib/client.js";
import { fail, ok, printJson } from "../lib/output.js";

/** Mode-aware: the sandbox dashboard is a different host from the live one. */
function connectUrl(flags: GlobalFlags): string {
  return `${appBase(flags)}/go-live`;
}

/**
 * Why there is no `infi providers connect`.
 *
 * Connecting a provider decides which account the merchant's money lands in, so
 * the backend gates it behind step-up auth (fresh MFA on a dashboard session).
 * A step-up token is only ever minted for a staff session — an API key can
 * neither obtain nor replay one. So the CLI reports and verifies; connecting is
 * dashboard-only, by design.
 */
function connectHint(flags: GlobalFlags): string {
  return `Connecting needs fresh MFA, which an API key cannot obtain — do it in the dashboard: ${connectUrl(flags)}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "connected":
      return pc.green(status);
    case "pending_webhook":
      return pc.yellow(status);
    case "needs_reconnect":
      return pc.red(status);
    default:
      return pc.dim(status);
  }
}

export async function providersList(flags: GlobalFlags): Promise<void> {
  const { connections, supported } = await infiClient(flags).providers.list();

  if (flags.json) {
    printJson({ connections, supported, connectUrl: connectUrl(flags) });
    return;
  }

  if (connections.length === 0) {
    ok("No provider connected");
    console.log(pc.dim(`  supported: ${supported.join(", ") || "none"}`));
    console.log(pc.dim(`  ${connectHint(flags)}`));
    return;
  }

  ok(`${connections.length} provider connection(s)`);
  for (const c of connections) {
    console.log(`  ${c.provider.padEnd(8)} ${statusColor(c.status)}`);
    if (c.externalAccountId) console.log(pc.dim(`    account:   ${c.externalAccountId}`));
    console.log(pc.dim(`    webhook:   ${c.webhookRegistered ? "registered" : "NOT registered"}`));
    if (c.webhookUrl) console.log(pc.dim(`    url:       ${c.webhookUrl}`));
    if (c.publishableKey) console.log(pc.dim(`    pk:        ${c.publishableKey}`));
    if (c.lastVerifiedAt) console.log(pc.dim(`    verified:  ${c.lastVerifiedAt}`));
  }

  const notConnected = supported.filter((s) => !connections.some((c) => c.provider === s));
  if (notConnected.length > 0) {
    console.log(pc.dim(`  not connected: ${notConnected.join(", ")}`));
  }
}

export async function providersVerify(
  flags: GlobalFlags & { provider?: string },
): Promise<void> {
  if (!flags.provider) fail(new Error("Usage: infi providers verify <stripe|asaas>"), flags.json);
  const conn = await infiClient(flags).providers.verify(flags.provider);

  if (flags.json) {
    printJson(conn);
    return;
  }
  ok(`${conn.provider}: ${conn.status}`);
  if (conn.status === "needs_reconnect") {
    console.log(pc.dim(`  The stored key no longer works. ${connectHint(flags)}`));
  }
}
