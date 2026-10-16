import path from "node:path";
import pc from "picocolors";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import {
  loadCompanyConfig,
  lockPathFor,
  readLockFor,
  resolveCompanyFile,
  writeLock,
} from "../lib/company-file.js";
import { ok, printJson } from "../lib/output.js";

export async function syncCommand(
  flags: GlobalFlags & { file?: string; plan?: boolean; force?: boolean },
): Promise<void> {
  const file = resolveCompanyFile(flags.file);
  const config = await loadCompanyConfig(file);
  const infi = infiClient(flags);
  // The client's mode, not a second reading of the key: the lock has to match
  // the host the writes actually go to.
  const lockPath = lockPathFor(file, infi.mode);
  const result = await infi.sync(config, {
    plan: flags.plan ?? false,
    force: flags.force ?? false,
    lock: readLockFor(path.dirname(lockPath), infi.mode),
  });

  if (flags.json) {
    printJson(result);
    if (result.drift.length && !flags.force) process.exitCode = 2;
    return;
  }

  const label = flags.plan ? "Plan" : "Synced";
  ok(`${label} (${result.actions.length} actions):`);
  for (const a of result.actions) {
    if (!flags.plan && a.action === "skip") continue;
    const detail = a.detail ? `  ${pc.dim(`(${a.detail})`)}` : "";
    const tag = a.action === "blocked" ? pc.yellow(a.action) : a.action;
    console.log(`  ${tag}\t${a.resource}\t${a.ref}${detail}`);
  }

  if (result.drift.length && !flags.force) {
    console.log("");
    console.log(pc.yellow(`⚠ ${result.drift.length} item(s) diverge from the file and the lock does not vouch for overwriting them:`));
    for (const d of result.drift) console.log(`  ${d.product}: ${d.detail}`);
    console.log(pc.dim("Changed in the dashboard, or already in the tenant with no lock entry."));
    console.log(pc.dim("Re-run with --force to overwrite, or `infi pull` to adopt the tenant's state."));
    if (!flags.plan) writeLock(lockPath, result.lock);
    process.exitCode = 2;
    return;
  }

  if (!flags.plan) {
    writeLock(lockPath, result.lock);
    console.log(pc.dim(`Lock written: ${path.relative(process.cwd(), lockPath)}`));
  }
}
