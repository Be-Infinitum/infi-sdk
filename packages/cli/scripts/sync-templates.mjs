import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, "..");
// Two asset trees ship inside the package: scaffolding templates and the skills
// `infi skills install` copies into a user's project. Canonical copies live at the
// repo root so the CLI and the MCP server cannot drift apart.
const ASSETS = ["templates", "skills"];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

for (const asset of ASSETS) {
  const from = path.join(pkgRoot, "..", "..", asset);
  const to = path.join(pkgRoot, asset);
  if (!fs.existsSync(from)) {
    console.warn(`sync-assets: no ${asset} at`, from);
    continue;
  }
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  copyDir(from, to);
  console.log(`sync-assets: ${asset} ->`, path.relative(pkgRoot, to));
}
