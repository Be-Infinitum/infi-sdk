import path from "node:path";
import pc from "picocolors";
import { withAppUrl } from "@beinfi/sdk";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import {
  loadCompanyConfig,
  lockPathFor,
  readLock,
  resolveCompanyFile,
  writeLock,
} from "../lib/company-file.js";
import { ok, printJson } from "../lib/output.js";

export async function syncCommand(
  flags: GlobalFlags & { file?: string; plan?: boolean; force?: boolean; appUrl?: string },
): Promise<void> {
  const file = resolveCompanyFile(flags.file);
  const lockPath = lockPathFor(file);
  let config = await loadCompanyConfig(file);
  if (flags.appUrl) {
    config = withAppUrl(config, flags.appUrl);
  }
  const infi = infiClient(flags);
  const result = await infi.sync(config, {
    plan: flags.plan ?? false,
    force: flags.force ?? false,
    lock: readLock(lockPath),
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
    console.log(pc.yellow(`⚠ ${result.drift.length} item(s) changed in the dashboard since the last sync:`));
    for (const d of result.drift) console.log(`  ${d.product}: ${d.detail}`);
    console.log(pc.dim("Re-run with --force to overwrite, or `infi pull` to adopt the dashboard changes."));
    if (!flags.plan) writeLock(lockPath, result.lock);
    process.exitCode = 2;
    return;
  }

  if (!flags.plan) {
    writeLock(lockPath, result.lock);
    console.log(pc.dim(`Lock written: ${path.relative(process.cwd(), lockPath)}`));
  }
}
