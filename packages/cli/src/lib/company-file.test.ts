import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCompanyConfig } from "./company-file.js";

const dirs: string[] = [];

function project(pkg: Record<string, unknown>, config: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infi-company-"));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  fs.writeFileSync(path.join(dir, "infi.company.ts"), config);
  return path.join(dir, "infi.company.ts");
}

const CONFIG = `export default { products: [{ key: "item", type: "item", pricingModel: "one_time" }] };\n`;

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("loadCompanyConfig", () => {
  // Node picks the module format from the nearest package.json, so the ESM .ts
  // `infi bootstrap` generates threw "Cannot use import statement outside a
  // module" in every plain `npm init` project.
  it("reads an ESM .ts config from a CommonJS project", async () => {
    const file = project({ name: "cjs", type: "commonjs" }, CONFIG);

    const config = await loadCompanyConfig(file);

    expect(config.products[0]!.key).toBe("item");
    expect(fs.readdirSync(path.dirname(file)).filter((f) => f.includes("infi-company"))).toEqual([]);
  });

  it("reads it from an ESM project too", async () => {
    const config = await loadCompanyConfig(project({ name: "esm", type: "module" }, CONFIG));
    expect(config.products[0]!.key).toBe("item");
  });
});
