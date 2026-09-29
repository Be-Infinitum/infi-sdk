import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { packTemplate } from "./template-zip.js";

const repoTemplates = path.resolve(__dirname, "..", "..", "..", "..", "templates");

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "infi-zip-"));
}

describe("template zip", () => {
  it("ships the Ecommerce template with its manifest and no key or env file", () => {
    const zip = packTemplate(path.join(repoTemplates, "ecommerce"), "ecommerce");
    const dir = tmp();
    const file = path.join(dir, "ecommerce.zip");
    fs.writeFileSync(file, zip);
    execFileSync("unzip", ["-q", file, "-d", dir]);
    const root = path.join(dir, "ecommerce");
    const all: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else all.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(all).toContain("infi.company.ts");
    expect(all).toContain("AGENTS.md");
    expect(all).toContain("assets/ebook.pdf");
    expect(all.filter((f) => path.basename(f).startsWith(".env"))).toEqual([".env.example"]);
    const manifest = fs.readFileSync(path.join(root, "infi.company.ts"), "utf8");
    expect(manifest).toContain("schemaVersion: 1");
    expect(manifest).not.toContain("__APP_SLUG__");
    for (const f of all) {
      const text = fs.readFileSync(path.join(root, f));
      expect(text.toString("latin1")).not.toMatch(/sk_(?:test|live)_[0-9a-f]{16}/);
    }
    expect(fs.readFileSync(path.join(root, "assets/ebook.pdf")).equals(
      fs.readFileSync(path.join(repoTemplates, "ecommerce/assets/ebook.pdf")),
    )).toBe(true);
  });

  it("refuses to pack a folder that carries a key", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "config.ts"), `export const k = "sk_test_${"a".repeat(32)}";\n`);
    expect(() => packTemplate(dir, "x")).toThrow(/shaped like a key/);
  });

  it("never packs env files, locks or the project id", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, ".env.local"), "INFI_SECRET_KEY=whatever\n");
    fs.writeFileSync(path.join(dir, "infi.company.sandbox.lock.json"), "{}");
    fs.mkdirSync(path.join(dir, ".infi"));
    fs.writeFileSync(path.join(dir, ".infi", "project.json"), "{}");
    fs.writeFileSync(path.join(dir, "ok.txt"), "ok");
    const zip = packTemplate(dir, "x").toString("latin1");
    expect(zip).toContain("x/ok.txt");
    expect(zip).not.toContain(".env.local");
    expect(zip).not.toContain("lock.json");
    expect(zip).not.toContain("project.json");
  });
});
