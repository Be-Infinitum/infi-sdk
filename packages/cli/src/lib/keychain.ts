import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where the CLI keeps the keys it was given (B5): the OS keychain, never the
 * plain config file. macOS `security`, Linux `secret-tool` (libsecret); any
 * other box falls back to a 0600 file under ~/.config/infi and says so.
 *
 * Account names are `<mode>:<tenant>:<project>` — one key per project per mode.
 */
const SERVICE = "infi-cli";

export type KeychainBackend = {
  name: string;
  get(account: string): string | undefined;
  set(account: string, secret: string): void;
  delete(account: string): void;
};

function run(cmd: string, args: string[], input?: string): string {
  return execFileSync(cmd, args, {
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
    encoding: "utf8",
  }).trim();
}

const macos: KeychainBackend = {
  name: "macOS Keychain",
  get(account) {
    try {
      return run("security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"]) || undefined;
    } catch {
      return undefined;
    }
  },
  set(account, secret) {
    // -U updates in place. `security` takes the secret as an argument only;
    // the process lives for milliseconds, under the same user.
    run("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", secret]);
  },
  delete(account) {
    try {
      run("security", ["delete-generic-password", "-s", SERVICE, "-a", account]);
    } catch {
      // already gone
    }
  },
};

const libsecret: KeychainBackend = {
  name: "Secret Service (libsecret)",
  get(account) {
    try {
      return run("secret-tool", ["lookup", "service", SERVICE, "account", account]) || undefined;
    } catch {
      return undefined;
    }
  },
  set(account, secret) {
    // secret-tool reads the secret on stdin: it never shows in argv.
    run("secret-tool", ["store", "--label", `Infi CLI ${account}`, "service", SERVICE, "account", account], secret);
  },
  delete(account) {
    try {
      run("secret-tool", ["clear", "service", SERVICE, "account", account]);
    } catch {
      // already gone
    }
  },
};

function fileBackend(dir = path.join(os.homedir(), ".config", "infi")): KeychainBackend {
  const file = path.join(dir, "credentials.json");
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const write = (all: Record<string, string>) => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  };
  return {
    name: `file (${file}, 0600)`,
    get: (account) => read()[account],
    set: (account, secret) => write({ ...read(), [account]: secret }),
    delete: (account) => {
      const all = read();
      delete all[account];
      write(all);
    },
  };
}

function has(cmd: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

let chosen: KeychainBackend | undefined;

export function keychain(): KeychainBackend {
  if (chosen) return chosen;
  if (process.env.INFI_KEYCHAIN === "file") chosen = fileBackend();
  else if (process.platform === "darwin" && has("security")) chosen = macos;
  else if (process.platform === "linux" && has("secret-tool")) chosen = libsecret;
  else chosen = fileBackend();
  return chosen;
}

/** For tests. */
export function useKeychain(backend: KeychainBackend | undefined): void {
  chosen = backend;
}

export function keyAccount(mode: "sandbox" | "live", tenantSlug: string, projectId: string): string {
  return `${mode}:${tenantSlug}:${projectId}`;
}
