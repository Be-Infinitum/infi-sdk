import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCompanyConfig, lockPathFor, migrateLegacyLocks, readLockFor } from "./company-file.js";

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

describe("per-mode locks", () => {
  function dir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "infi-lock-"));
    dirs.push(d);
    return d;
  }
  const LOCK = { version: 1, products: { item: { state: "{}", syncedAt: "t" } } };

  it("names one lock per mode next to the config", () => {
    expect(path.basename(lockPathFor("/p/infi.company.ts", "sandbox"))).toBe("infi.company.sandbox.lock.json");
    expect(path.basename(lockPathFor("/p/infi.billing.ts", "live"))).toBe("infi.company.live.lock.json");
  });

  // Pre-0.2.8 locks never recorded their mode and their ids carry none.
  it("migrates a legacy lock with no mode to sandbox, once, with one warning", () => {
    const d = dir();
    fs.writeFileSync(path.join(d, "infi.billing.lock.json"), JSON.stringify(LOCK));
    const warnings: string[] = [];

    expect(readLockFor(d, "sandbox", (m) => warnings.push(m))).toEqual(LOCK);
    expect(readLockFor(d, "sandbox", (m) => warnings.push(m))).toEqual(LOCK);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/infi\.billing\.lock\.json → infi\.company\.sandbox\.lock\.json/);
    expect(fs.readdirSync(d).sort()).toEqual(["infi.company.sandbox.lock.json"]);
  });

  it("migrates to live when the lock recorded live, and a live read never sees sandbox provenance", () => {
    const d = dir();
    fs.writeFileSync(path.join(d, "infi.company.lock.json"), JSON.stringify({ ...LOCK, mode: "live" }));

    expect(readLockFor(d, "sandbox", () => {})).toBeUndefined();
    expect(readLockFor(d, "live", () => {})?.mode).toBe("live");
  });

  it("never overwrites an existing per-mode lock: the legacy one is kept as .bak", () => {
    const d = dir();
    fs.writeFileSync(path.join(d, "infi.company.sandbox.lock.json"), JSON.stringify({ ...LOCK, mode: "sandbox" }));
    fs.writeFileSync(path.join(d, "infi.company.lock.json"), JSON.stringify(LOCK));
    const warnings: string[] = [];

    const done = migrateLegacyLocks(d, (m) => warnings.push(m));

    expect(done[0]?.keptAsBackup).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(d, "infi.company.sandbox.lock.json"), "utf8")).mode).toBe("sandbox");
    expect(fs.existsSync(path.join(d, "infi.company.lock.json.bak"))).toBe(true);
  });
});
