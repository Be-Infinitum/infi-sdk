import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BillingConfig } from "@beinfi/sdk";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import { die, ok, printJson } from "../lib/output.js";

const DEFAULT_FILES = ["infi.billing.ts", "infi.billing.mts", "billing.config.ts"];

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

export async function syncCommand(flags: GlobalFlags & { file?: string; plan?: boolean }): Promise<void> {
  const file = resolveBillingFile(flags.file);
  const config = await loadBillingConfig(file);
  const infi = infiClient(flags);
  const result = await infi.sync(config, { plan: flags.plan ?? false });

  if (flags.json) {
    printJson(result);
    return;
  }

  if (flags.plan) {
    ok(`Plan (${result.actions.length} actions):`);
    for (const a of result.actions) {
      const detail = a.detail ? `  (${a.detail})` : "";
      console.log(`  ${a.action}\t${a.resource}\t${a.ref}${detail}`);
    }
    return;
  }

  ok(`Synced (${result.actions.length} actions)`);
  for (const a of result.actions) {
    if (a.action === "skip") continue;
    const detail = a.detail ? ` (${a.detail})` : "";
    console.log(`  ${a.action} ${a.resource} ${a.ref}${detail}`);
  }
}
