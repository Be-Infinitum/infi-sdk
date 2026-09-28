import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CliProject } from "./cli-auth.js";

/**
 * The project this directory is, as the backend knows it: a stable id kept in
 * `.infi/project.json`, so every `infi login` from here gets the same named
 * key back (B5). Committed on purpose — it is not a secret, and a teammate
 * cloning the repo is the same project.
 */
export function ensureProject(cwd: string = process.cwd()): CliProject {
  const file = path.join(cwd, ".infi", "project.json");
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { projectId?: string; name?: string };
    if (saved.projectId) {
      return { projectId: saved.projectId, projectName: saved.name ?? projectName(cwd), machine: machineName() };
    }
  }
  const project = { projectId: `proj_${randomBytes(8).toString("hex")}`, name: projectName(cwd) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(project, null, 2)}\n`);
  return { projectId: project.projectId, projectName: project.name, machine: machineName() };
}

function projectName(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8")) as { name?: string };
    if (pkg.name) return pkg.name.slice(0, 80);
  } catch {
    // no package.json: the folder name says it
  }
  return path.basename(path.resolve(cwd)).slice(0, 80);
}

/** "macbook" rather than "Caios-MacBook-Pro.local": it labels a key, it identifies nothing. */
export function machineName(): string {
  return os.hostname().replace(/\.local$/, "").slice(0, 80);
}
