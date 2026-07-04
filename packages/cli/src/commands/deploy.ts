import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import { die, info, ok, printJson } from "../lib/output.js";

const DEFAULT_EVENTS = ["payment.confirmed", "invoice.finalized"];

function normalizeUrl(raw: string): string {
  const url = raw.replace(/\/$/, "");
  if (!/^https?:\/\//.test(url)) {
    die("App URL must start with http:// or https://");
  }
  return url;
}

function webhookUrl(appUrl: string): string {
  return `${normalizeUrl(appUrl)}/api/webhooks/infi`;
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function upsertEnvLocal(cwd: string, entries: Record<string, string>): void {
  const envPath = path.join(cwd, ".env.local");
  const existing = readEnvFile(envPath);
  const merged = { ...existing, ...entries };
  const lines = ["# Updated by infi deploy", ...Object.entries(merged).map(([k, v]) => `${k}=${v}`), ""];
  fs.writeFileSync(envPath, lines.join("\n"));
}

function vercelAvailable(): boolean {
  return spawnSync("vercel", ["--version"], { stdio: "ignore" }).status === 0;
}

function detectVercelProductionUrl(cwd: string): string | undefined {
  const projectFile = path.join(cwd, ".vercel", "project.json");
  if (!fs.existsSync(projectFile)) return undefined;
  const result = spawnSync("vercel", ["inspect", "--prod", "--json"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) return undefined;
  try {
    const data = JSON.parse(result.stdout) as { url?: string };
    return data.url ? `https://${data.url.replace(/^https?:\/\//, "")}` : undefined;
  } catch {
    return undefined;
  }
}

function pushVercelEnv(cwd: string, prod: boolean): void {
  if (!vercelAvailable()) {
    die("Vercel CLI not found. Install: npm i -g vercel");
  }
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) {
    die("No .env.local found. Run create-infi-app or copy .env.example first.");
  }
  const target = prod ? "production" : "preview";
  const vars = readEnvFile(envPath);
  for (const [key, value] of Object.entries(vars)) {
    if (!value) continue;
    info(`vercel env add ${key} ${target}`);
    const result = spawnSync("vercel", ["env", "add", key, target, "--force"], {
      cwd,
      input: `${value}\n`,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (result.status !== 0) {
      die(`Failed to set Vercel env var ${key}`);
    }
  }
}

function runVercelDeploy(cwd: string, prod: boolean): string | undefined {
  if (!vercelAvailable()) die("Vercel CLI not found.");
  const args = ["deploy"];
  if (prod) args.push("--prod");
  args.push("--yes");
  info(`Running: vercel ${args.join(" ")}`);
  const result = spawnSync("vercel", args, { cwd, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  if (result.status !== 0) die("Vercel deploy failed");
  const match = (result.stdout ?? "").match(/https:\/\/[^\s]+\.vercel\.app/);
  return match?.[0];
}

async function registerWebhook(
  flags: GlobalFlags,
  appUrl: string,
): Promise<{ webhookTarget: string; secret?: string; endpointId?: string }> {
  const infi = infiClient(flags);
  const target = webhookUrl(appUrl);
  const existing = (await infi.webhooks.list()).find((e) => e.url === target);

  if (existing?.id) {
    return { webhookTarget: target, endpointId: existing.id };
  }

  const created = await infi.webhooks.create({
    url: target,
    events: DEFAULT_EVENTS,
  });
  return { webhookTarget: target, secret: created.secret, endpointId: created.id };
}

export async function deployCommand(
  flags: GlobalFlags & {
    url?: string;
    vercel?: boolean;
    prod?: boolean;
    cwd?: string;
    skipWebhook?: boolean;
    skipEnv?: boolean;
  },
): Promise<void> {
  const cwd = flags.cwd ?? process.cwd();
  let appUrl = flags.url;

  if (flags.vercel && !appUrl) {
    appUrl = runVercelDeploy(cwd, flags.prod ?? false) ?? detectVercelProductionUrl(cwd);
  }

  if (!appUrl) {
    appUrl = detectVercelProductionUrl(cwd);
  }

  if (!appUrl) {
    die("Pass --url https://your-app.vercel.app or run `infi deploy vercel` from a linked project.");
  }

  appUrl = normalizeUrl(appUrl);

  let webhookSecret: string | undefined;
  let webhookTarget: string | undefined;

  if (!flags.skipWebhook) {
    const reg = await registerWebhook(flags, appUrl);
    webhookTarget = reg.webhookTarget;
    webhookSecret = reg.secret;
    if (webhookSecret) {
      upsertEnvLocal(cwd, { INFI_WEBHOOK_SECRET: webhookSecret });
    }
  }

  if (flags.vercel && !flags.skipEnv) {
    pushVercelEnv(cwd, flags.prod ?? false);
  }

  if (flags.json) {
    printJson({ appUrl, webhookTarget, webhookSecretSet: Boolean(webhookSecret) });
    return;
  }

  ok(`App URL: ${appUrl}`);
  if (webhookTarget) {
    ok(`Webhook registered: ${webhookTarget}`);
    if (webhookSecret) {
      info("INFI_WEBHOOK_SECRET written to .env.local");
    } else {
      info("Webhook already existed — secret not rotated.");
    }
  }
  if (flags.vercel) {
    info("Vercel env synced from .env.local");
  }
}
