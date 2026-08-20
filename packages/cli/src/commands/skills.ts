import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pc from "picocolors";

/**
 * Agent skills: the integration recipes, packaged for the reader that actually
 * follows them step by step. They ship inside this package (see
 * scripts/sync-templates.mjs) so `npx @beinfi/cli skills install` works with no
 * network and no repo access.
 */
export interface SkillMeta {
  /** Directory name, and what `skills install <name>` takes. */
  id: string;
  /** `name:` from the frontmatter — what an agent matches on. */
  name: string;
  /** `description:` from the frontmatter — when to use it. */
  description: string;
  file: string;
}

/** Where the bundled skills live, both from src (dev) and dist (published). */
function skillsRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js -> ../skills ;  src/commands/skills.ts -> ../../skills
  for (const rel of ["../skills", "../../skills", "../../../skills"]) {
    const candidate = path.resolve(here, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("skills: bundled skills not found in this install");
}

/** Reads `name:` / `description:` out of the YAML frontmatter, no parser needed. */
function readMeta(dir: string, id: string): SkillMeta | undefined {
  const file = path.join(dir, id, "SKILL.md");
  if (!fs.existsSync(file)) return undefined;
  const head = fs.readFileSync(file, "utf8").split("\n", 12);
  const field = (key: string): string => {
    const line = head.find((l) => l.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim() : "";
  };
  return { id, name: field("name") || id, description: field("description"), file };
}

export function listSkills(): SkillMeta[] {
  const root = skillsRoot();
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readMeta(root, e.name))
    .filter((s): s is SkillMeta => s !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function skillsList(opts: { json?: boolean }): void {
  const skills = listSkills();
  if (opts.json) {
    console.log(JSON.stringify({ skills }, null, 2));
    return;
  }
  console.log(`\n${pc.bold("Infi skills")} — install into .claude/skills/ with ${pc.cyan("infi skills install")}\n`);
  for (const s of skills) {
    console.log(`  ${pc.cyan(s.id)}\n    ${pc.dim(s.description)}`);
  }
  console.log();
}

export interface SkillsInstallOptions {
  /** Skill ids to install. Empty installs all of them. */
  which: string[];
  /** Project root. Defaults to cwd. */
  cwd?: string;
  /** Overwrite a skill that is already installed. */
  force?: boolean;
  json?: boolean;
}

export interface SkillsInstallResult {
  dir: string;
  installed: string[];
  skipped: { id: string; reason: string }[];
}

/**
 * Copies skills into `<project>/.claude/skills/<id>/`, which is where Claude Code
 * looks. Never overwrites without --force: a user may have edited one, and
 * silently reverting their edit is worse than refusing.
 */
export function installSkills(opts: SkillsInstallOptions): SkillsInstallResult {
  const root = skillsRoot();
  const available = listSkills();
  const cwd = opts.cwd ?? process.cwd();
  const dir = path.join(cwd, ".claude", "skills");

  const wanted = opts.which.length > 0 ? opts.which : available.map((s) => s.id);
  const installed: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  fs.mkdirSync(dir, { recursive: true });
  for (const id of wanted) {
    if (!available.some((s) => s.id === id)) {
      skipped.push({ id, reason: "unknown skill" });
      continue;
    }
    const target = path.join(dir, id);
    if (fs.existsSync(target) && !opts.force) {
      skipped.push({ id, reason: "already installed (--force to overwrite)" });
      continue;
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(path.join(root, id), target, { recursive: true });
    installed.push(id);
  }
  return { dir, installed, skipped };
}

export function skillsInstall(opts: SkillsInstallOptions): void {
  const result = installSkills(opts);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const rel = path.relative(opts.cwd ?? process.cwd(), result.dir) || result.dir;
  if (result.installed.length > 0) {
    console.log(`\n${pc.green("✔")} ${result.installed.length} skill(s) → ${pc.cyan(rel)}`);
    for (const id of result.installed) console.log(`    ${id}`);
  }
  for (const s of result.skipped) {
    console.log(`  ${pc.yellow("skip")} ${s.id} — ${pc.dim(s.reason)}`);
  }
  if (result.installed.length > 0) {
    console.log(`\n${pc.dim("Your agent can now use them by name. Start with:")} sell-digital-product\n`);
  }
}
