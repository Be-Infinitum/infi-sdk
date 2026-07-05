import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, "..");
const repoTemplates = path.join(pkgRoot, "..", "..", "templates");
const pkgTemplates = path.join(pkgRoot, "templates");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(repoTemplates)) {
  console.warn("sync-templates: no repo templates at", repoTemplates);
  process.exit(0);
}

if (fs.existsSync(pkgTemplates)) fs.rmSync(pkgTemplates, { recursive: true, force: true });
copyDir(repoTemplates, pkgTemplates);
console.log("sync-templates: copied", repoTemplates, "→", pkgTemplates);
