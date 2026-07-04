import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import { die, ok, printJson } from "../lib/output.js";

export async function keysList(flags: GlobalFlags): Promise<void> {
  const infi = infiClient(flags);
  const keys = await infi.apiKeys.list();
  if (flags.json) {
    printJson(keys);
    return;
  }
  if (keys.length === 0) {
    ok("No API keys.");
    return;
  }
  for (const k of keys) {
    const revoked = k.revokedAt ? " (revoked)" : "";
    console.log(`${k.id}\t${k.prefix ?? "?"}…${k.lastFour ?? "????"}\t${k.kind ?? "secret"}${revoked}`);
  }
}

export async function keysCreate(
  flags: GlobalFlags & { kind?: "secret" | "publishable" },
): Promise<void> {
  const infi = infiClient(flags);
  const key = await infi.apiKeys.create({ kind: flags.kind ?? "secret" });
  if (!key.secret) die("Key created but secret not returned.");
  if (flags.json) {
    printJson(key);
    return;
  }
  ok("API key created (shown once):");
  console.log(key.secret);
}

export async function keysRevoke(flags: GlobalFlags & { id: string }): Promise<void> {
  if (!flags.id) die("Usage: infi keys revoke <key-id>");
  const infi = infiClient(flags);
  const key = await infi.apiKeys.revoke(flags.id);
  if (flags.json) {
    printJson(key);
    return;
  }
  ok(`Revoked ${key.id}`);
}
