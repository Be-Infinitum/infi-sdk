import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pc from "picocolors";
import type { BillingConfig, SyncLock } from "@beinfi/sdk";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import { die, ok, printJson } from "../lib/output.js";

const DEFAULT_FILES = ["infi.billing.ts", "infi.billing.mts", "billing.config.ts"];
const LOCK_FILE = "infi.billing.lock.json";

async function loadBillingConfig(filePath: string): Promise<BillingConfig> {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) die(`Billing config not found: ${abs}`);

  const mod = (await import(pathToFileURL(abs).href)) as {
    default?: BillingConfig;
    billing?: BillingConfig;
  };

  const config = mod.default ?? mod.billing;
  if (!config?.products?.length) {
    die(`No billing config exported from ${abs} (expected default export from defineBilling(...))`);
  }
  return config;
}

function resolveBillingFile(explicit?: string): string {
  if (explicit) return explicit;
  for (const candidate of DEFAULT_FILES) {
    if (fs.existsSync(path.resolve(candidate))) return candidate;
  }
  die(`No billing config found. Pass a file or create ${DEFAULT_FILES[0]}`);
}

/** Lockfile sits next to the config file. */
export function lockPathFor(configFile: string): string {
  return path.join(path.dirname(path.resolve(configFile)), LOCK_FILE);
}

export function readLock(lockPath: string): SyncLock | undefined {
  if (!fs.existsSync(lockPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8")) as SyncLock;
  } catch {
    return undefined;
  }
}

export function writeLock(lockPath: string, lock: SyncLock): void {
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

export async function syncCommand(
  flags: GlobalFlags & { file?: string; plan?: boolean; force?: boolean },
): Promise<void> {
  const file = resolveBillingFile(flags.file);
  const lockPath = lockPathFor(file);
  const config = await loadBillingConfig(file);
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
    console.log(pc.yellow(`⚠ ${result.drift.length} product(s) changed in the dashboard since the last sync:`));
    for (const d of result.drift) console.log(`  ${d.product}: ${d.detail}`);
    console.log(pc.dim("Re-run with --force to overwrite, or `infi pull` to adopt the dashboard changes."));
    if (!flags.plan) writeLock(lockPath, result.lock); // persist unblocked products
    process.exitCode = 2;
    return;
  }

  if (!flags.plan) {
    writeLock(lockPath, result.lock);
    console.log(pc.dim(`Lock written: ${path.relative(process.cwd(), lockPath)}`));
  }
}
