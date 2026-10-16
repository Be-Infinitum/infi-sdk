/**
 * Which provisioning tools an agent may run with a key.
 *
 * Catalog writes no longer need this guard: the server plans and applies
 * (ADR 0025), and on live an apply is always a proposal a person approves with
 * step-up, so `infi_sync_apply` runs with any key and returns the approval
 * link. Provisioning is different — onboard, bootstrap and claim create a
 * sandbox tenant and rewrite `.env.local` — and a live project is no place for
 * that. They refuse any key that is not positively a sandbox key; an unknown
 * prefix is refused too, so a new key type cannot slip through as "not live".
 */
export function agentWriteRefusal(tool: string, key: string | undefined): string | undefined {
  if (key === undefined || key.startsWith("sk_test_")) return undefined;
  const live = key.startsWith("sk_live_");
  return [
    `${tool} refused: this MCP server is configured with ${live ? "a live key (sk_live_…)" : "a key that is not a sandbox key (sk_test_…)"}.`,
    "Provisioning a sandbox does not belong in a live project.",
    "To change the catalog, use infi_sync_apply: with a live key it returns a link where the human approves the change.",
  ].join(" ");
}
