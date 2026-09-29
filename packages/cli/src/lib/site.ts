import fs from "node:fs";
import path from "node:path";
import type { Infi, OAuthClient } from "@beinfi/sdk";
import { upsertEnv } from "./dotenv.js";
import { ensureProject } from "./project.js";

/** Where the template's auth route receives Infi's answer. */
export const CALLBACK_PATH = "/api/infi/auth/callback";

/** The dev server's port, from `next dev -p NNNN` (or `--port`); 3000 otherwise. */
export function devPort(cwd: string): number {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    const m = /(?:-p|--port)[ =](\d{2,5})/.exec(pkg.scripts?.dev ?? "");
    if (m) return Number(m[1]);
  } catch {
    // no package.json
  }
  return 3000;
}

/**
 * Register this project as a site that signs buyers in with Infi (an OAuth
 * client), with the local callback and any deployed ones, and write its
 * INFI_CLIENT_ID to .env.local. Idempotent: the backend adds redirect URIs by
 * name and never drops one.
 */
export async function registerSite(infi: Infi, cwd: string, origins: string[] = []): Promise<OAuthClient> {
  const project = ensureProject(cwd);
  const redirectUris = [`http://localhost:${devPort(cwd)}${CALLBACK_PATH}`, ...origins.map((o) => `${o.replace(/\/$/, "")}${CALLBACK_PATH}`)];
  const client = await infi.oauthClients.upsert({ name: `${project.projectName} · ${project.projectId}`, redirectUris });
  upsertEnv(path.join(cwd, ".env.local"), { INFI_CLIENT_ID: client.clientId });
  return client;
}
