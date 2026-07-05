import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = path.join(repoRoot, "examples");
const templatesDir = path.join(repoRoot, "templates");

const EXAMPLE_TEMPLATES = ["crm", "ebook-sale", "ai-chat", "marketplace-billing"];

function shouldSkip(name) {
  return (
    name === "node_modules" ||
    name === ".next" ||
    name === "dist" ||
    name.endsWith(".tsbuildinfo") ||
    name === "dev.db" ||
    name === "dev.db-journal"
  );
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function patchPackageJson(dest) {
  const pkgPath = path.join(dest, "package.json");
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.dependencies && typeof pkg.dependencies === "object") {
    for (const [key, value] of Object.entries(pkg.dependencies)) {
      if (value === "workspace:*") {
        pkg.dependencies[key] = "^0.8.1";
      }
    }
  }
  pkg.name = "__APP_NAME__";
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

for (const name of EXAMPLE_TEMPLATES) {
  const src = path.join(examplesDir, name);
  const dest = path.join(templatesDir, name);
  if (!fs.existsSync(src)) {
    console.warn("skip missing example", name);
    continue;
  }
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  copyDir(src, dest);
  patchPackageJson(dest);
  console.log("normalized", name, "→", dest);
}

console.log("done");
