import path from "node:path";
import pc from "picocolors";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import { loadCompanyConfig, obsoleteLockNotice, resolveCompanyFile } from "../lib/company-file.js";
import { ok, printJson } from "../lib/output.js";
import { exitCodeFor, printHeld, printPlan, printSecrets } from "../lib/plan-output.js";

export type SyncFlags = GlobalFlags & {
  file?: string;
  plan?: boolean;
  adoptUnmanaged?: boolean;
  archiveOrphaned?: boolean;
  overwriteDrift?: boolean;
};

/**
 * `infi sync`: the file goes to the server, which plans and applies it
 * (ADR 0025). The plan's sentences are printed before the apply; on live the
 * apply is a proposal and the command prints where a person approves it.
 */
export async function syncCommand(flags: SyncFlags): Promise<void> {
  const file = resolveCompanyFile(flags.file);
  const config = await loadCompanyConfig(file);
  const notice = obsoleteLockNotice(path.dirname(path.resolve(file)));
  if (notice) process.stderr.write(`${pc.dim(notice)}\n`);

  const infi = infiClient(flags);
  const result = await infi.sync(config, {
    plan: flags.plan ?? false,
    adoptUnmanaged: flags.adoptUnmanaged,
    archiveOrphaned: flags.archiveOrphaned,
    overwriteDrift: flags.overwriteDrift,
    // Shown before the apply, so what is applied is what the user read.
    onPlan: flags.json ? undefined : (plan) => printPlan(plan),
  });
  process.exitCode = exitCodeFor(result.status);

  if (flags.json) {
    const { document: _doc, ...rest } = result;
    printJson(rest);
    return;
  }

  switch (result.status) {
    case "planned":
      printPlan(result.plan);
      if (result.plan.blocked) printHeld(result.held);
      else if (result.plan.hasChanges) console.log(pc.dim(`\nApply with: infi sync${flags.file ? ` ${flags.file}` : ""}`));
      break;
    case "unchanged":
      ok("Nothing to apply: the tenant matches the file.");
      break;
    case "blocked":
      printPlan(result.plan);
      printHeld(result.held);
      break;
    case "stale":
      console.log(pc.yellow("The tenant changed since that plan, so nothing was applied. This is the plan now:\n"));
      printPlan(result.plan);
      console.log(pc.dim("\nReview it and run `infi sync` again to apply it."));
      break;
    case "proposed":
      ok(`\nProposed as revision #${result.revision?.number} (live changes are approved by a person).`);
      console.log(`  Approve it here: ${pc.bold(result.approvalUrl ?? "")}`);
      console.log(pc.dim("  Nothing changes on live until it is approved. Do not run sync again to retry it."));
      break;
    case "applied":
      ok(`\nApplied revision #${result.revision?.number}.`);
      printSecrets(result.secrets ?? []);
      break;
  }
}
