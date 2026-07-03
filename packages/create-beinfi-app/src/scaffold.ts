import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateId } from "./types.js";

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Resolve bundled templates directory (works in monorepo + published package). */
export function templatesDir(): string {
  const bundled = path.join(pkgRoot, "templates");
  if (fs.existsSync(bundled)) return bundled;
  const monorepo = path.join(pkgRoot, "..", "..", "templates");
  if (fs.existsSync(monorepo)) return monorepo;
  throw new Error("Templates directory not found. Run `bun run build` in create-beinfi-app.");
}

export function templatePath(id: TemplateId): string {
  const dir = path.join(templatesDir(), id);
  if (!fs.existsSync(dir)) {
    throw new Error(`Template "${id}" not found at ${dir}`);
  }
  return dir;
}

function shouldSkip(name: string): boolean {
  return name === "node_modules" || name === ".next" || name === "dist";
}

function copyRecursive(src: string, dest: string, replacements: Record<string, string>) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(from, to, replacements);
    } else {
      let content = fs.readFileSync(from, "utf8");
      for (const [key, value] of Object.entries(replacements)) {
        content = content.split(key).join(value);
      }
      fs.writeFileSync(to, content);
    }
  }
}

export type ScaffoldOptions = {
  template: TemplateId;
  targetDir: string;
  appName: string;
  appSlug: string;
  port: number;
};

export function scaffold(options: ScaffoldOptions): void {
  const { template, targetDir, appName, appSlug, port } = options;
  if (fs.existsSync(targetDir)) {
    throw new Error(`Directory already exists: ${targetDir}`);
  }

  const replacements: Record<string, string> = {
    __APP_NAME__: appName,
    __APP_SLUG__: appSlug,
    __PORT__: String(port),
  };

  copyRecursive(templatePath(template), targetDir, replacements);

  const pkgPath = path.join(targetDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string };
    pkg.name = appName;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}
