import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CliProfile = {
  email?: string;
  tenantSlug?: string;
  tenantId?: string;
  secretKey?: string;
  baseUrl: string;
  updatedAt?: string;
};

export type CliConfig = {
  defaultProfile: string;
  profiles: Record<string, CliProfile>;
};

const CONFIG_DIR = path.join(os.homedir(), ".config", "infi");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function configPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): CliConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { defaultProfile: "default", profiles: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as CliConfig;
  } catch {
    return { defaultProfile: "default", profiles: {} };
  }
}

export function saveConfig(config: CliConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function getProfile(config: CliConfig, name?: string): CliProfile | undefined {
  const key = name ?? config.defaultProfile;
  return config.profiles[key];
}

export function upsertProfile(config: CliConfig, name: string, patch: CliProfile): CliConfig {
  return {
    ...config,
    defaultProfile: config.defaultProfile || name,
    profiles: {
      ...config.profiles,
      [name]: {
        ...config.profiles[name],
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}
