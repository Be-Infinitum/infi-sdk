import fs from "node:fs";
import path from "node:path";

/**
 * Reads the env file the CLI itself wrote.
 *
 * `bootstrap` and `init` write `.env.local` with `INFI_SECRET_KEY`, and nothing
 * read it back — so `infi sync` / `doctor` / `pull` in that same directory, seconds
 * later, failed with `missing_secret_key`. Two independent cold-start audits hit it,
 * and both were then told by the error's own fix to run `infi claim create`, which
 * provisions a SECOND tenant and abandons the one holding their product.
 *
 * Deliberately not a dotenv dependency: this reads a file we generate ourselves, so
 * it needs `KEY=value`, optional quotes, comments and blank lines — not variable
 * expansion or multiline values.
 */
const FILES = [".env.local", ".env"];

/** Keys worth honouring from a project file. Anything else stays the app's business. */
const KEYS = ["INFI_SECRET_KEY", "INFI_API_URL", "INFI_APP_URL", "INFI_TENANT_SLUG"] as const;

export type ProjectEnv = Partial<Record<(typeof KEYS)[number], string>>;

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip one matching pair of quotes; the generated file quotes DATABASE_URL.
    if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.endsWith(value[0]!)) {
      value = value.slice(1, -1);
    }
    if (value !== "") out[key] = value;
  }
  return out;
}

/**
 * Infi settings from `.env.local`, else `.env`, in the given directory. First file
 * that exists wins outright — merging two env files is how you get a key from one
 * and a host from the other, pointed at different environments.
 */
export function readProjectEnv(cwd: string = process.cwd()): ProjectEnv {
  for (const name of FILES) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    let parsed: Record<string, string>;
    try {
      parsed = parse(fs.readFileSync(file, "utf8"));
    } catch {
      return {}; // unreadable is the same as absent; never fail a command over it
    }
    const out: ProjectEnv = {};
    for (const key of KEYS) {
      if (parsed[key]) out[key] = parsed[key];
    }
    return out;
  }
  return {};
}
