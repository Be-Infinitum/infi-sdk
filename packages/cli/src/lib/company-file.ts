import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BillingConfig, CompanyIntent, SyncLock } from "@beinfi/sdk";
import { die } from "./output.js";

export const DEFAULT_COMPANY_FILES = [
  "infi.company.ts",
  "infi.company.mts",
  "infi.billing.ts",
  "infi.billing.mts",
  "billing.config.ts",
];

export type LockMode = "sandbox" | "live";

/**
 * One lock per mode. Sandbox and live are separate sets of ids, so a single
 * lock meant a live sync measured drift against sandbox provenance (or the
 * other way round) and every switch of key looked like a dashboard edit.
 */
export function lockFileNameFor(mode: LockMode): string {
  return `infi.company.${mode}.lock.json`;
}

/** The lock next to `configFile` for this mode. */
export function lockPathFor(configFile: string, mode: LockMode): string {
  return lockPathIn(path.dirname(path.resolve(configFile)), mode);
}

export function lockPathIn(dir: string, mode: LockMode): string {
  return path.join(path.resolve(dir), lockFileNameFor(mode));
}

/** Single-lock names from before 0.2.8, oldest last. */
export const LEGACY_LOCK_FILES = ["infi.company.lock.json", "infi.billing.lock.json"];

export interface LockMigration {
  from: string;
  to: string;
  mode: LockMode;
  /** The per-mode lock already existed: the legacy file was kept aside as `.bak`. */
  keptAsBackup: boolean;
}

/**
 * Move a pre-0.2.8 single lock to its per-mode name, once.
 *
 * The mode is the one recorded in the lock. Locks that old never recorded it,
 * and their ids say nothing about the mode either, so they go to sandbox: a live
 * apply then finds no live lock and the drift guard blocks until a human runs
 * `infi pull` or `--force` — the safe side to be wrong on.
 *
 * Renamed, not copied, so the warning fires on exactly one run.
 */
export function migrateLegacyLocks(
  dir: string,
  warn: (message: string) => void = (m) => process.stderr.write(`${m}\n`),
): LockMigration[] {
  const done: LockMigration[] = [];
  for (const name of LEGACY_LOCK_FILES) {
    const from = path.join(path.resolve(dir), name);
    if (!fs.existsSync(from)) continue;
    const mode: LockMode = readLock(from)?.mode === "live" ? "live" : "sandbox";
    const to = lockPathIn(dir, mode);
    const keptAsBackup = fs.existsSync(to);
    if (keptAsBackup) fs.renameSync(from, `${from}.bak`);
    else fs.renameSync(from, to);
    done.push({ from, to, mode, keptAsBackup });
    warn(
      keptAsBackup
        ? `infi: ${name} is from before per-mode locks and ${path.basename(to)} already exists; kept the old one as ${name}.bak.`
        : `infi: migrated ${name} → ${path.basename(to)} (locks are per mode now; ${mode === "live" ? "it recorded live" : "assumed sandbox: the old lock did not record its mode"}). Commit the rename.`,
    );
  }
  return done;
}

/** Migrate any legacy lock in `dir`, then read this mode's lock. */
export function readLockFor(dir: string, mode: LockMode, warn?: (message: string) => void): SyncLock | undefined {
  migrateLegacyLocks(dir, warn);
  return readLock(lockPathIn(dir, mode));
}

type CompanyModule = {
  default?: BillingConfig;
  billing?: BillingConfig;
  company?: BillingConfig;
};

/** Nearest package.json `type`. Node reads a bare `.ts` as CJS unless it is "module". */
function projectIsEsm(fromDir: string): boolean {
  let dir = fromDir;
  for (;;) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        return (JSON.parse(fs.readFileSync(pkg, "utf8")) as { type?: string }).type === "module";
      } catch {
        return false;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Import an ESM `.ts` config from a project that is not `"type": "module"`.
 * Node picks the module format from the nearest package.json, so a generated
 * `infi.company.ts` throws "Cannot use import statement outside a module" in any
 * plain `npm init` project. `.mts` is unconditionally ESM, and a sibling keeps
 * the file's own relative imports resolvable.
 */
async function importAsModule(abs: string): Promise<CompanyModule> {
  const shim = path.join(path.dirname(abs), `.infi-company-${process.pid}.mts`);
  fs.copyFileSync(abs, shim);
  try {
    return (await import(pathToFileURL(shim).href)) as CompanyModule;
  } finally {
    fs.rmSync(shim, { force: true });
  }
}

export async function loadCompanyConfig(filePath: string): Promise<BillingConfig> {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) die(`Company config not found: ${abs}`);

  // Check the project first: letting the plain import fail also prints a Node
  // loader warning we cannot suppress, on the happy path of `infi sync`.
  const needsShim = abs.endsWith(".ts") && !projectIsEsm(path.dirname(abs));
  let mod: CompanyModule;
  if (needsShim) {
    mod = await importAsModule(abs);
  } else {
    try {
      mod = (await import(pathToFileURL(abs).href)) as CompanyModule;
    } catch (err) {
      if (!/import statement outside a module|Unexpected token/i.test(String(err))) throw err;
      mod = await importAsModule(abs);
    }
  }

  const config = mod.default ?? mod.company ?? mod.billing;
  if (!config?.products?.length) {
    die(
      `No company config exported from ${abs} (expected default export from defineCompany(...) or defineBilling(...))`,
    );
  }
  return config;
}

export function resolveCompanyFile(explicit?: string): string {
  if (explicit) return explicit;
  for (const candidate of DEFAULT_COMPANY_FILES) {
    if (fs.existsSync(path.resolve(candidate))) return candidate;
  }
  die(`No company config found. Pass a file or create infi.company.ts`);
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

/** Generate infi.company.ts from an intent. */
export function renderCompanyFile(intent: CompanyIntent): string {
  const lines = [
    `import { defineCompany } from "@beinfi/sdk";`,
    ``,
    `/** Company as code — generated by \`infi bootstrap --intent ${intent}\`. */`,
    `export default defineCompany.fromIntent(${JSON.stringify(intent)});`,
    ``,
  ];
  return lines.join("\n");
}

export function writeCompanyFile(cwd: string, intent: CompanyIntent): string {
  const file = path.join(cwd, "infi.company.ts");
  fs.writeFileSync(file, renderCompanyFile(intent));
  return file;
}
