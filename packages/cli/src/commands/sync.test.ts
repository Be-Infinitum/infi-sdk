import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lockPathFor, readModeLock, writeLock } from "../lib/company-file.js";
import { fileReader, rewriteManifest } from "./sync.js";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "infi-sync-"));
}

describe("locks per mode", () => {
  it("keeps sandbox and live apart, and reads the legacy lock as sandbox", () => {
    const dir = tmp();
    const file = path.join(dir, "infi.company.ts");
    expect(path.basename(lockPathFor(file, "sandbox"))).toBe("infi.company.sandbox.lock.json");
    expect(path.basename(lockPathFor(file, "live"))).toBe("infi.company.live.lock.json");
    writeLock(lockPathFor(file), { version: 1, products: { legacy: { state: "x", syncedAt: "t" } } });
    expect(readModeLock(file, "sandbox")?.products.legacy).toBeDefined();
    expect(readModeLock(file, "live")).toBeUndefined();
  });
});

describe("file deliverables", () => {
  it("reads a file next to the manifest with its digest, and refuses paths outside it", async () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets", "ebook.pdf"), "pdf");
    const read = fileReader(dir);
    const f = await read("./assets/ebook.pdf");
    expect(f.contentType).toBe("application/pdf");
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(read("../../etc/passwd")).rejects.toThrow(/leaves the project/);
  });
});

describe("rewriteManifest", () => {
  it("writes a renamed key and the store slug actually taken back into the file", () => {
    const dir = tmp();
    const file = path.join(dir, "infi.company.ts");
    fs.writeFileSync(file, `export default { products: [{ key: "ecommerce/ebook" }], storefront: { slug: "minha-loja", products: ["ecommerce/ebook"] } };\n`);
    expect(rewriteManifest(file, { "ecommerce/ebook": "ecommerce/ebook-2" }, { from: "minha-loja", to: "minha-loja-x1" })).toBe(true);
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain(`"ecommerce/ebook-2"`);
    expect(text).not.toContain(`"ecommerce/ebook"`);
    expect(text).toContain(`slug: "minha-loja-x1"`);
  });
});
