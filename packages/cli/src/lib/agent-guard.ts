/**
 * What an agent may write with a key.
 *
 * Until the backend runs plan/apply itself (ADR 0025 on the Infi side, with
 * step-up approval), the rule for agents is: in live they only propose. An MCP
 * tool that writes refuses any key that is not positively a sandbox key — an
 * unknown prefix is refused too, so a new key type cannot slip through as "not
 * live". The human applies with `infi sync`, which is not behind this guard.
 */
export function agentWriteRefusal(tool: string, key: string | undefined): string | undefined {
  if (key === undefined || key.startsWith("sk_test_")) return undefined;
  const live = key.startsWith("sk_live_");
  return [
    `${tool} refused: this MCP server is configured with ${live ? "a live key (sk_live_…)" : "a key that is not a sandbox key (sk_test_…)"}.`,
    "In live an agent only proposes changes, it never applies them.",
    "Run infi_sync_plan and show the plan to the human. They apply it with `infi sync` from the CLI",
    "(or, once it exists, approve it in the dashboard at app.beinfi.com).",
  ].join(" ");
}
