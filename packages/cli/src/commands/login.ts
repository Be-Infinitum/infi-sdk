import path from "node:path";
import { LIVE_API_BASE, SANDBOX_API_BASE, resolveAppBase } from "@beinfi/sdk";
import pc from "picocolors";
import {
  browserLogin,
  deviceLogin,
  prefersDeviceCode,
  type CliTokenResponse,
} from "../lib/cli-auth.js";
import { apiBaseOverride, type GlobalFlags } from "../lib/client.js";
import { loadConfig, saveConfig, upsertProfile } from "../lib/config.js";
import { readProjectEnv, upsertEnv } from "../lib/dotenv.js";
import { keyAccount, keychain } from "../lib/keychain.js";
import { die, info, ok, printJson } from "../lib/output.js";
import { ensureProject } from "../lib/project.js";

export type LoginFlags = GlobalFlags & {
  profile?: string;
  /** Use the device code even with a browser at hand. */
  device?: boolean;
  /** A live key for this project (the dashboard runs a step-up first). */
  live?: boolean;
  /** Replace this project's key (its copy was lost). */
  rotate?: boolean;
  quiet?: boolean;
};

export type LoginResult = {
  email: string;
  tenant: CliTokenResponse["tenant"];
  mode: "sandbox" | "live";
  secretKey: string;
  envFile: string;
  keyName?: string;
  reused: boolean;
};

/**
 * `infi login` (B5): the browser (or a device code) approves; this project gets
 * its own named key, the same one on every later login from here; the key is
 * kept in the OS keychain and written to the project's env file. Never an
 * sk_live_ without `--live` — and then the dashboard asks for a step-up.
 */
export async function login(flags: LoginFlags): Promise<LoginResult> {
  const cwd = path.resolve(flags.cwd ?? process.cwd());
  const mode = flags.live ? "live" : "sandbox";
  const api = apiBaseOverride(flags)?.url ?? (mode === "live" ? LIVE_API_BASE : SANDBOX_API_BASE);
  const app = (process.env.INFI_APP_URL ?? readProjectEnv(cwd).INFI_APP_URL ?? resolveAppBase(mode)).replace(/\/$/, "");
  const project = ensureProject(cwd);
  const envFile = path.join(cwd, mode === "live" ? ".env.live.local" : ".env.local");

  // Rotate only when this machine has no copy of the project's key: the server
  // would otherwise answer "reused" with no secret, and there would be nothing
  // to put in the env file.
  const envKey = readProjectEnv(cwd).INFI_SECRET_KEY;
  const haveCopy = Boolean(envKey && envKey.startsWith(mode === "live" ? "sk_live_" : "sk_test_"));
  const rotate = flags.rotate ?? false;

  const say = (msg: string) => {
    if (!flags.quiet && !flags.json) console.log(msg);
  };
  const onUrl = (url: string) => say(`${pc.bold("Abra no navegador para entrar:")}\n  ${pc.cyan(url)}`);
  const run = (again: boolean) =>
    flags.device || prefersDeviceCode()
      ? deviceLogin({
          apiBase: api,
          project,
          rotate: again,
          onCode: (s) =>
            say(
              `${pc.bold("Para entrar, abra")} ${pc.cyan(s.verificationUri)}\n` +
                `${pc.bold("e digite o código")} ${pc.yellow(s.userCode)}  ${pc.dim(`(ou ${s.verificationUriComplete})`)}`,
            ),
        })
      : browserLogin({ apiBase: api, appBase: app, project, rotate: again, live: flags.live, onUrl });

  let res = await run(rotate);
  let secret = res.apiKey.secret;
  const account = keyAccount(mode, res.tenant.slug, project.projectId);
  if (!secret) {
    // Reused: the copy is in the keychain or already in the env file.
    secret = keychain().get(account) ?? (haveCopy ? envKey : undefined);
    if (!secret) {
      say(pc.dim("A chave deste projeto não está nesta máquina; aprovando uma nova no navegador…"));
      res = await run(true);
      secret = res.apiKey.secret;
    }
  }
  if (!secret) die("Login succeeded but no key came back. Run `infi login --rotate`.");

  keychain().set(account, secret);
  upsertEnv(envFile, { INFI_SECRET_KEY: secret, INFI_TENANT_SLUG: res.tenant.slug });
  const profileName = flags.profile ?? (mode === "live" ? "live" : "default");
  saveConfig(
    upsertProfile(loadConfig(), profileName, {
      email: res.email,
      tenantSlug: res.tenant.slug,
      tenantId: res.tenant.id,
      baseUrl: api,
    }),
  );
  return {
    email: res.email,
    tenant: res.tenant,
    mode,
    secretKey: secret,
    envFile,
    keyName: res.apiKey.name,
    reused: res.apiKey.reused,
  };
}

export async function loginCommand(flags: LoginFlags & { token?: string }): Promise<void> {
  if (flags.token) {
    die(
      "`infi login --token` is gone: nobody pastes a session anymore. Run `infi login` — it opens the " +
        "browser (or shows a code with --device).",
    );
  }
  const r = await login(flags);
  if (flags.json) {
    printJson({
      email: r.email,
      tenant: r.tenant,
      mode: r.mode,
      keyName: r.keyName,
      reused: r.reused,
      prefix: r.secretKey.slice(0, 8),
      envFile: path.relative(process.cwd(), r.envFile),
      keychain: keychain().name,
    });
    return;
  }
  ok(`Logged in as ${r.email} (${r.tenant.slug}, ${r.mode})`);
  info(`${r.reused ? "Reused" : "Created"} ${r.keyName ?? "the project key"} — ${r.secretKey.slice(0, 12)}…`);
  info(`Saved to ${keychain().name} and ${path.relative(process.cwd(), r.envFile)}`);
}
