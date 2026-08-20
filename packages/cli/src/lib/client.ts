import {
  Infi,
  InfiError,
  modeFromKey,
  resolveApiBase,
  resolveAppBase,
  SANDBOX_API_BASE,
  type InfiMode,
} from "@beinfi/sdk";
import { readProjectEnv } from "./dotenv.js";
import { getProfile, loadConfig } from "./config.js";

export type GlobalFlags = {
  key?: string;
  profile?: string;
  local?: boolean;
  json?: boolean;
};

export const LOCAL_API_BASE = "http://localhost:8088";

/**
 * The key this invocation would use, or undefined. Non-throwing `resolveSecretKey`.
 *
 * The project's own `.env.local` sits between the real environment and the saved
 * profile: it is more specific than a global login and less explicit than an env
 * var the caller exported. Reading it at all is the fix for `bootstrap` writing a
 * key that `sync` in the same directory could not find.
 */
export function findSecretKey(flags: GlobalFlags): string | undefined {
  return (
    flags.key ??
    process.env.INFI_SECRET_KEY ??
    readProjectEnv().INFI_SECRET_KEY ??
    getProfile(loadConfig(), flags.profile)?.secretKey ??
    undefined
  );
}

/** sandbox vs live, from the key prefix — the same rule the SDK applies. */
export function resolveMode(flags: GlobalFlags): InfiMode {
  return modeFromKey(findSecretKey(flags));
}

/** The host if it was pinned by hand, else undefined. Doctor reports which won. */
export function apiBaseOverride(flags: GlobalFlags): { url: string; source: string } | undefined {
  if (flags.local) return { url: LOCAL_API_BASE, source: "--local" };
  const fromEnv = process.env.INFI_API_URL;
  if (fromEnv) return { url: fromEnv.replace(/\/$/, ""), source: "INFI_API_URL" };
  // `init --local` writes this into .env.local; honouring it is what makes a local
  // project keep talking to localhost across commands.
  const fromFile = readProjectEnv().INFI_API_URL;
  if (fromFile) return { url: fromFile.replace(/\/$/, ""), source: ".env.local" };
  return undefined;
}

/**
 * Pick the API host from the key prefix, like the SDK does. This used to default
 * to the live host, so a sk_test_ key 401'd everywhere and the sandbox-only
 * /public/v1/claimables 404'd — the first command in the docs could not succeed.
 */
export function apiBase(flags: GlobalFlags): string {
  const override = apiBaseOverride(flags);
  if (override) return override.url;
  // A saved profile records the host its key came from (local / self-host logins),
  // but an explicit --key or INFI_SECRET_KEY outranks it.
  if (!flags.key && !process.env.INFI_SECRET_KEY && !readProjectEnv().INFI_SECRET_KEY) {
    const saved = getProfile(loadConfig(), flags.profile)?.baseUrl;
    if (saved) return saved.replace(/\/$/, "");
  }
  return resolveApiBase(resolveMode(flags));
}

/**
 * Host for the public claimable endpoints. Live serves no /public/v1/claimables,
 * so provisioning ignores a saved live profile and only honors --local /
 * INFI_API_URL — otherwise `infi bootstrap` 404s before it starts.
 */
export function provisioningApiBase(flags: GlobalFlags): string {
  return apiBaseOverride(flags)?.url ?? SANDBOX_API_BASE;
}

/**
 * Dashboard host for claim / go-live / provider-connect links. Mode-aware for the
 * same reason the API host is: a sandbox tenant does not exist on the live app.
 */
export function appBase(flags: GlobalFlags): string {
  const fromEnv = process.env.INFI_APP_URL ?? readProjectEnv().INFI_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return resolveAppBase(resolveMode(flags));
}

/** Coded so `--json` output and `InfiError.fix` carry something runnable. */
export function resolveSecretKey(flags: GlobalFlags): string {
  const key = findSecretKey(flags);
  if (key) return key;
  throw new InfiError(
    "No API key found. Run `infi login`, pass --key / INFI_SECRET_KEY, or run this " +
      "from a directory whose .env.local has one. If you have never provisioned, " +
      "`infi bootstrap` creates a tenant — do NOT run it to fix this error in a " +
      "project that already has one, it provisions a second.",
    400,
    "missing_secret_key",
  );
}

export function infiClient(flags: GlobalFlags): Infi {
  return new Infi({
    secretKey: resolveSecretKey(flags),
    apiUrl: apiBase(flags),
  });
}

export function publicInfi(flags: GlobalFlags): Infi {
  return new Infi({ apiUrl: apiBase(flags) });
}
