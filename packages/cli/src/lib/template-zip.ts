import fs from "node:fs";
import path from "node:path";
import { shouldSkip } from "./scaffold.js";

/**
 * The template as a download (decisoes.md, Entrega): a zip with the manifest
 * and NO key. Nothing in it grants access to an account, so there is nothing
 * to revoke when it is downloaded again and no link that has to expire. The
 * first `infi login` + `infi sync` in the unzipped folder seeds the person's
 * own sandbox.
 *
 * Store-only zip (no compression): no dependency, and every reader opens it.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.byteLength, 18);
    local.writeUInt32LE(e.data.byteLength, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, Buffer.from(e.data));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.data.byteLength, 20);
    central.writeUInt32LE(e.data.byteLength, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + e.data.byteLength;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** A key-shaped string anywhere in a text file refuses the pack. */
const KEY = /\b(?:sk|pk|bt)_(?:test|live)?_?[0-9a-f]{16,}\b/;

export function templateEntries(
  dir: string,
  root: string,
  replacements: Record<string, string>,
): ZipEntry[] {
  const out: ZipEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (shouldSkip(entry.name) || /\.lock\.json$/.test(entry.name) || entry.name === ".infi") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...templateEntries(abs, root, replacements));
      continue;
    }
    let data: Uint8Array = fs.readFileSync(abs);
    if (!/\.(?:pdf|png|jpe?g|webp|zip|epub|mp[34])$/i.test(entry.name)) {
      let text = Buffer.from(data).toString("utf8");
      for (const [k, v] of Object.entries(replacements)) text = text.split(k).join(v);
      if (KEY.test(text)) throw new Error(`${path.relative(root, abs)} contains something shaped like a key; refusing to pack.`);
      data = Buffer.from(text, "utf8");
    }
    const rel = path.relative(root, abs).split(path.sep).join("/");
    out.push({ name: rel === "_gitignore" ? ".gitignore" : rel, data });
  }
  return out;
}

/** Packs a template folder into `<id>/…` inside a zip, placeholders filled with neutral defaults. */
export function packTemplate(templateDir: string, id: string): Buffer {
  const entries = templateEntries(templateDir, templateDir, {
    __APP_NAME__: "minha-loja",
    __APP_SLUG__: "minha-loja",
    __PORT__: "3000",
  }).map((e) => ({ ...e, name: `${id}/${e.name}` }));
  return buildZip(entries);
}
