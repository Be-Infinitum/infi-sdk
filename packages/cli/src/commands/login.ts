import { exchangeCliToken } from "@beinfi/sdk";
import pc from "picocolors";
import { loadConfig, saveConfig, upsertProfile } from "../lib/config.js";
import { apiBase } from "../lib/client.js";
import type { GlobalFlags } from "../lib/client.js";
import { die, info, ok, printJson } from "../lib/output.js";

export async function loginCommand(
  flags: GlobalFlags & { token?: string; tenant?: string; profile?: string },
): Promise<void> {
  const profileName = flags.profile ?? "default";

  if (!flags.token) {
    console.log(`
${pc.bold("infi login")} — connect the CLI to your Infi dashboard account

1. Sign in at ${pc.cyan("https://app.beinfi.com")}
2. Copy your session token from the dashboard / devtools (Clerk JWT)
3. Run:

   ${pc.bold("infi login --token <session-token>")}

The CLI exchanges it for a tenant API key and saves it to ~/.config/infi/config.json
`);
    return;
  }

  const baseUrl = apiBase(flags);
  const res = await exchangeCliToken({
    apiUrl: baseUrl,
    sessionToken: flags.token,
    tenantSlug: flags.tenant,
  });

  if (!res.apiKey.secret) {
    die("Login succeeded but no API key secret was returned.");
  }

  let config = loadConfig();
  config = upsertProfile(config, profileName, {
    email: res.email,
    tenantSlug: res.tenant.slug,
    tenantId: res.tenant.id,
    secretKey: res.apiKey.secret,
    baseUrl,
  });
  saveConfig(config);

  if (flags.json) {
    printJson({
      email: res.email,
      tenant: res.tenant,
      prefix: res.apiKey.prefix,
      lastFour: res.apiKey.lastFour,
      profile: profileName,
    });
    return;
  }

  ok(`Logged in as ${res.email} (${res.tenant.slug})`);
  info(`Profile "${profileName}" saved to ~/.config/infi/config.json`);
  info(`Secret key: ${res.apiKey.secret.slice(0, 12)}…`);
}
