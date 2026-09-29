import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import {
  SchemaVersionError,
  modeOfKey,
  type CollisionAnswer,
  type DeliverableFile,
  type KeyCollision,
} from "@beinfi/sdk";
import pc from "picocolors";
import type { GlobalFlags } from "../lib/client.js";
import { findSecretKey, infiClient } from "../lib/client.js";
import {
  loadCompanyConfig,
  lockPathFor,
  readModeLock,
  resolveCompanyFile,
  writeLock,
} from "../lib/company-file.js";
import { die, ok, printJson } from "../lib/output.js";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".zip": "application/zip",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

/** Reads a delivery file next to the manifest, with the digest the lock compares. */
export function fileReader(manifestDir: string) {
  return async (rel: string): Promise<DeliverableFile> => {
    const abs = path.resolve(manifestDir, rel);
    if (!abs.startsWith(path.resolve(manifestDir) + path.sep)) {
      throw new Error(`deliverable path "${rel}" leaves the project directory.`);
    }
    if (!fs.existsSync(abs)) throw new Error(`deliverable file not found: ${rel}`);
    const bytes = new Uint8Array(fs.readFileSync(abs));
    return {
      bytes,
      fileName: path.basename(abs),
      contentType: CONTENT_TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
}

/** Writes the answers back into the manifest: renamed keys, the store slug actually taken. */
export function rewriteManifest(file: string, renames: Record<string, string>, slug?: { from: string; to: string }): boolean {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of Object.entries(renames)) {
    text = text.replaceAll(JSON.stringify(from), JSON.stringify(to)).replaceAll(`'${from}'`, `'${to}'`);
  }
  if (slug && slug.from !== slug.to) {
    text = text.replace(new RegExp(`(slug:\\s*)(["'])${slug.from}\\2`), `$1$2${slug.to}$2`);
  }
  if (text === before) return false;
  fs.writeFileSync(file, text);
  return true;
}

function interactive(flags: { json?: boolean; yes?: boolean }): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !flags.json);
}

async function askCollision(c: KeyCollision): Promise<CollisionAnswer> {
  const lines = Object.entries(c.diff).map(([k, [have, want]]) => `  ${k}: ${pc.red(String(have))} → ${pc.green(String(want))}`);
  p.note(lines.length ? lines.join("\n") : "  (same fields)", `"${c.key}" já existe na sua conta`);
  const choice = await p.select({
    message: "O que fazer com este produto?",
    options: [
      { value: "rename", label: "Criar o do template com outra key", hint: "o seu produto fica como está" },
      { value: "adopt", label: "Adotar: o template passa a gerenciar o seu produto", hint: "preço novo vira versão nova" },
      { value: "skip", label: "Pular por agora" },
    ],
  });
  if (p.isCancel(choice) || choice === "skip") return { action: "skip" };
  if (choice === "adopt") return { action: "adopt" };
  const key = await p.text({ message: "Nova key", initialValue: `${c.key}-2` });
  if (p.isCancel(key) || !String(key).trim()) return { action: "skip" };
  return { action: "rename", key: String(key).trim() };
}

async function askSlug(slug: string, suggestion: string): Promise<string | null> {
  const chosen = await p.text({
    message: `O endereço da loja "${slug}" já é de outra loja. Use este ou edite:`,
    initialValue: suggestion,
    validate: (v) => (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v ?? "") ? undefined : "letras minúsculas, números e hífen"),
  });
  return p.isCancel(chosen) ? null : String(chosen);
}

export async function syncCommand(
  flags: GlobalFlags & { file?: string; plan?: boolean; force?: boolean },
): Promise<void> {
  const file = resolveCompanyFile(flags.file);
  const mode = modeOfKey(findSecretKey(flags));
  const lockPath = lockPathFor(file, mode);
  const config = await loadCompanyConfig(file);
  const infi = infiClient(flags);
  const ask = interactive(flags);
  let result;
  try {
    result = await infi.sync(config, {
      plan: flags.plan ?? false,
      force: flags.force ?? false,
      lock: readModeLock(file, mode),
      mode,
      readFile: fileReader(path.dirname(path.resolve(file))),
      onCollision: ask ? askCollision : undefined,
      onSlugTaken: ask ? askSlug : undefined,
    });
  } catch (err) {
    if (err instanceof SchemaVersionError) die(err.message);
    throw err;
  }

  if (!flags.plan) {
    const slugChange =
      config.storefront && result.storefrontSlug ? { from: config.storefront.slug, to: result.storefrontSlug } : undefined;
    if (rewriteManifest(file, result.renames, slugChange) && !flags.json) {
      console.log(pc.dim(`${path.relative(process.cwd(), file)} updated with your answers.`));
    }
  }

  const blocked = result.drift.length > 0 || result.collisions.length > 0 ||
    result.actions.some((a) => a.action === "blocked");

  if (flags.json) {
    printJson({ ...result, mode });
    if (blocked && !flags.force) process.exitCode = 2;
    if (!flags.plan) writeLock(lockPath, result.lock);
    return;
  }

  const label = flags.plan ? "Plan" : "Synced";
  ok(`${label} on ${mode} (${result.actions.length} actions):`);
  for (const a of result.actions) {
    if (!flags.plan && a.action === "skip") continue;
    const detail = a.detail ? `  ${pc.dim(`(${a.detail})`)}` : "";
    const tag = a.action === "blocked" ? pc.yellow(a.action) : a.action;
    console.log(`  ${tag}\t${a.resource}\t${a.ref}${detail}`);
  }

  if (result.collisions.length) {
    console.log("");
    console.log(pc.yellow(`⚠ ${result.collisions.length} template key(s) already used by products this project did not create:`));
    for (const c of result.collisions) {
      const diff = Object.entries(c.diff).map(([k, [h, w]]) => `${k}: ${h} → ${w}`).join("; ");
      console.log(`  ${c.key}${diff ? `  ${pc.dim(diff)}` : ""}`);
    }
    console.log(pc.dim("Run `infi sync` in a terminal to adopt or rename them."));
  }

  if (result.drift.length && !flags.force) {
    console.log("");
    console.log(pc.yellow(`⚠ ${result.drift.length} item(s) changed in the dashboard since the last sync:`));
    for (const d of result.drift) console.log(`  ${d.product}: ${d.detail}`);
    console.log(pc.dim("Re-run with --force to overwrite, or `infi pull` to adopt the dashboard changes."));
  }

  if (!flags.plan) {
    writeLock(lockPath, result.lock);
    console.log(pc.dim(`Lock written: ${path.relative(process.cwd(), lockPath)}`));
  }
  if (blocked && !flags.force) process.exitCode = 2;
}
