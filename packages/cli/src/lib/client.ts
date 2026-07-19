import { Infi, LIVE_API_BASE } from "@beinfi/sdk";
import { getProfile, loadConfig } from "./config.js";

export type GlobalFlags = {
  key?: string;
  profile?: string;
  local?: boolean;
  json?: boolean;
};

export function apiBase(flags: GlobalFlags): string {
  if (flags.local) return "http://localhost:8088";
  const fromEnv = process.env.INFI_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const profile = getProfile(loadConfig(), flags.profile);
  return profile?.baseUrl?.replace(/\/$/, "") ?? LIVE_API_BASE;
}

export function resolveSecretKey(flags: GlobalFlags): string {
  if (flags.key) return flags.key;
  if (process.env.INFI_SECRET_KEY) return process.env.INFI_SECRET_KEY;
  const profile = getProfile(loadConfig(), flags.profile);
  if (profile?.secretKey) return profile.secretKey;
  throw new Error("No API key found. Run `infi login` or pass --key / INFI_SECRET_KEY.");
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
