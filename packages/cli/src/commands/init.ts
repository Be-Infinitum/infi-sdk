import * as p from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import fs from "node:fs";
import { scaffold } from "../lib/scaffold.js";
import { provisionClaimable } from "../lib/provision.js";
import {
  DEFAULT_PORT,
  TEMPLATE_META,
  slugFromName,
  validateProjectName,
  writeEnvFile,
  writeEnvExample,
  type TemplateId,
} from "../lib/init-support.js";
import { runInstall, runDbPush, runSetup, startDockerDb } from "../lib/run-setup.js";

/** Brand wordmark (ANSI Shadow "infi") in a cyan gradient. */
function banner(): void {
  const rows = [
    "  ██╗███╗   ██╗███████╗██╗",
    "  ██║████╗  ██║██╔════╝██║",
    "  ██║██╔██╗ ██║█████╗  ██║",
    "  ██║██║╚██╗██║██╔══╝  ██║",
    "  ██║██║ ╚████║██║     ██║",
    "  ╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝",
  ];
  // Top-to-bottom shade ramp — brightest at the top, cooler toward the base.
  const shades = [
    (s: string) => pc.bold(pc.cyanBright(s)),
    (s: string) => pc.bold(pc.cyanBright(s)),
    (s: string) => pc.bold(pc.cyan(s)),
    (s: string) => pc.cyan(s),
    (s: string) => pc.blue(s),
    (s: string) => pc.dim(pc.blue(s)),
  ];
  console.log("");
  rows.forEach((row, i) => console.log(shades[i](row)));
  console.log(`  ${pc.dim("billable apps —")} ${pc.cyan("auth · checkout · usage")}\n`);
}

/** Bail cleanly on Ctrl-C from any prompt. */
function guard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel(pc.dim("Cancelled — nothing was created."));
    process.exit(0);
  }
  return value as T;
}

type InitOptions = {
  projectName: string;
  template: TemplateId;
  port: number;
  cwd: string;
  skipProvision: boolean;
  skipInstall: boolean;
  skipSetup: boolean;
  local: boolean;
  yes: boolean;
};

function parseInitArgs(argv: string[]): Partial<InitOptions> & { help?: boolean } {
  const out: Partial<InitOptions> & { help?: boolean } = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--yes" || arg === "-y") out.yes = true;
    else if (arg === "--skip-provision") out.skipProvision = true;
    else if (arg === "--skip-install") out.skipInstall = true;
    else if (arg === "--skip-setup") out.skipSetup = true;
    else if (arg === "--local") out.local = true;
    else if (arg === "--template") out.template = argv[++i] as TemplateId;
    else if (arg === "--port") out.port = Number(argv[++i]);
    else if (!arg.startsWith("-")) positional.push(arg);
  }

  if (positional[0]) out.projectName = positional[0];
  return out;
}

function printInitHelp(): void {
  console.log(`
${pc.bold("infi init")} — scaffold a billable Next.js app with Infi

${pc.dim("Usage:")}
  infi init [project-name] [options]
  npm create infi-app [project-name] [options]

${pc.dim("Options:")}
  --template <id>     Template: default, crm, ebook-sale, ai-chat, marketplace-billing
  --port <n>          Dev server port (default: 3000)
  --local             Use local Infi API (:8088) and frontend (:4003)
  --skip-provision    Do not provision a claimable tenant (write .env.example only)
  --skip-install      Skip package install
  --skip-setup        Skip db:push and setup script
  -y, --yes           Skip prompts
  -h, --help          Show help
`);
}

async function resolveOptions(argv: string[]): Promise<InitOptions | null> {
  const parsed = parseInitArgs(argv);
  if (parsed.help) {
    printInitHelp();
    return null;
  }

  banner();
  p.intro(pc.bgCyan(pc.black(" create a new app ")));

  let projectName = parsed.projectName;
  if (!projectName && !parsed.yes) {
    projectName = guard(
      await p.text({
        message: "What should we call it?",
        placeholder: "my-app",
        defaultValue: "my-app",
        validate: validateProjectName,
      }),
    );
  }
  projectName = projectName ?? "my-app";
  if (validateProjectName(projectName)) {
    p.cancel(String(validateProjectName(projectName)));
    return null;
  }

  let template = parsed.template;
  if (!template && !parsed.yes) {
    template = guard(
      await p.select({
        message: "Pick a starter",
        options: (Object.keys(TEMPLATE_META) as TemplateId[]).map((value) => ({
          value,
          label: TEMPLATE_META[value].label,
          hint: TEMPLATE_META[value].hint,
        })),
      }),
    );
  }
  template = template ?? "default";

  let port = parsed.port ?? DEFAULT_PORT;
  if (!parsed.port && !parsed.yes && template === "default") {
    port = Number(
      guard(
        await p.text({
          message: "Dev server port",
          defaultValue: String(DEFAULT_PORT),
          placeholder: String(DEFAULT_PORT),
          validate: (v) => (Number(v) > 0 && Number(v) < 65536 ? undefined : "Invalid port"),
        }),
      ),
    );
  }

  const cwd = process.cwd();

  return {
    projectName,
    template,
    port,
    cwd,
    skipProvision: parsed.skipProvision ?? false,
    skipInstall: parsed.skipInstall ?? false,
    skipSetup: parsed.skipSetup ?? false,
    local: parsed.local ?? false,
    yes: parsed.yes ?? false,
  };
}

export async function initCommand(argv: string[]): Promise<void> {
  const options = await resolveOptions(argv);
  if (!options) return;

  const targetDir = path.join(options.cwd, options.projectName);
  const appSlug = slugFromName(options.projectName);

  const s = p.spinner();
  s.start("Scaffolding project…");
  try {
    scaffold({
      template: options.template,
      targetDir,
      appName: options.projectName,
      appSlug,
      port: options.port,
    });
    s.stop("Project scaffolded");
  } catch (err) {
    s.stop(pc.red("Scaffold failed"));
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let claimUrl: string | undefined;

  if (!options.skipProvision) {
    s.start("Provisioning claimable tenant…");
    try {
      const claimable = await provisionClaimable({ local: options.local, ref: "cli" });
      writeEnvFile(
        {
          targetDir,
          appSlug,
          appName: options.projectName,
          port: options.port,
          local: options.local,
        },
        claimable,
      );
      claimUrl = claimable.claimUrl;
      s.stop("Claimable tenant provisioned");
    } catch (err) {
      s.stop(pc.yellow("Provisioning failed — writing .env.example"));
      writeEnvExample(targetDir, options.projectName, appSlug, options.port);
      p.log.warn(err instanceof Error ? err.message : String(err));
      p.log.info("Fill INFI_SECRET_KEY manually, then run `bun run setup`.");
    }
  } else {
    writeEnvExample(targetDir, options.projectName, appSlug, options.port);
  }

  if (!options.skipInstall) {
    s.start("Installing dependencies…");
    try {
      runInstall(targetDir);
      s.stop("Dependencies installed");
    } catch (err) {
      s.stop(pc.yellow("Install failed"));
      p.log.warn(err instanceof Error ? err.message : String(err));
    }
  }

  if (!options.skipSetup && options.template === "default") {
    const composePath = path.join(targetDir, "docker-compose.yml");
    if (fs.existsSync(composePath)) {
      s.start("Starting Postgres (docker compose)…");
      const started = startDockerDb(targetDir);
      if (started) s.stop("Postgres started");
      else s.stop(pc.yellow("Docker not available — ensure Postgres is running locally"));
    }

    s.start("Running db:push + setup…");
    try {
      runDbPush(targetDir);
      runSetup(targetDir);
      s.stop("Tenant configured");
    } catch (err) {
      s.stop(pc.yellow("Setup skipped or failed"));
      p.log.warn(err instanceof Error ? err.message : String(err));
      p.log.info("Run manually: `docker compose up -d db && bun run db:push && bun run setup`");
    }
  } else if (!options.skipSetup && options.template !== "default") {
    p.log.info(`Template "${options.template}": run setup per its README after filling .env`);
  }

  const steps = [
    `${pc.cyan("cd")} ${options.projectName}`,
    `${pc.cyan("bun run dev")}`,
    pc.dim(`→ http://localhost:${options.port}`),
  ].join("\n");
  p.note(steps, pc.bold("Next steps"));

  if (claimUrl) {
    p.note(
      `${pc.dim("Keep this tenant after the trial:")}\n${pc.cyan(claimUrl)}`,
      pc.bold("Claim your tenant"),
    );
  }

  p.outro(`${pc.green("✓")} ${pc.bold(options.projectName)} is ready. ${pc.dim("Happy building.")}`);
}
