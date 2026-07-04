import * as p from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import fs from "node:fs";
import { scaffold } from "./scaffold.js";
import { provisionSandbox, writeEnvFile, writeEnvExample } from "./provision.js";
import { runInstall, runDbPush, runSetup, startDockerDb } from "./run-setup.js";
import {
  DEFAULT_PORT,
  slugFromName,
  validateProjectName,
  TEMPLATE_LABELS,
  type CliOptions,
  type TemplateId,
} from "./types.js";

function parseArgs(argv: string[]): Partial<CliOptions> & { help?: boolean } {
  const out: Partial<CliOptions> & { help?: boolean } = {};
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

function printHelp() {
  console.log(`
${pc.bold("create-infi-app")} — scaffold a billable Next.js app with Infi

${pc.dim("Usage:")}
  npm create infi-app [project-name] [options]

${pc.dim("Options:")}
  --template <id>     Template: default, crm, ebook-sale, ai-chat, marketplace-billing
  --port <n>          Dev server port (default: 3000)
  --local             Use local Infi API (:8088) and frontend (:4003)
  --skip-provision    Do not create a sandbox (write .env.example only)
  --skip-install      Skip package install
  --skip-setup        Skip db:push and setup script
  -y, --yes           Skip prompts
  -h, --help          Show help
`);
}

async function resolveOptions(argv: string[]): Promise<CliOptions | null> {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp();
    return null;
  }

  p.intro(pc.bgCyan(pc.black(" create-infi-app ")));

  let projectName = parsed.projectName;
  if (!projectName && !parsed.yes) {
    projectName = (await p.text({
      message: "Project name",
      placeholder: "my-app",
      defaultValue: "my-app",
      validate: validateProjectName,
    })) as string;
  }
  projectName = projectName ?? "my-app";
  if (validateProjectName(projectName)) {
    p.cancel(String(validateProjectName(projectName)));
    return null;
  }

  let template = parsed.template;
  if (!template && !parsed.yes) {
    template = (await p.select({
      message: "Pick a starter",
      options: (Object.keys(TEMPLATE_LABELS) as TemplateId[]).map((value) => ({
        value,
        label: TEMPLATE_LABELS[value],
      })),
    })) as TemplateId;
  }
  template = template ?? "default";

  let port = parsed.port ?? DEFAULT_PORT;
  if (!parsed.port && !parsed.yes && template === "default") {
    const portInput = await p.text({
      message: "Dev server port",
      defaultValue: String(DEFAULT_PORT),
      validate: (v) => (Number(v) > 0 && Number(v) < 65536 ? undefined : "Invalid port"),
    });
    if (p.isCancel(portInput)) {
      p.cancel("Cancelled");
      return null;
    }
    port = Number(portInput);
  }

  const cwd = process.cwd();
  const targetDir = path.join(cwd, projectName);

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

export async function main(argv: string[]): Promise<void> {
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
    s.start("Provisioning Infi sandbox…");
    try {
      const sandbox = await provisionSandbox(options.local);
      writeEnvFile(
        {
          targetDir,
          appSlug,
          appName: options.projectName,
          port: options.port,
          local: options.local,
        },
        sandbox,
      );
      claimUrl = sandbox.claimUrl;
      s.stop("Sandbox provisioned");
    } catch (err) {
      s.stop(pc.yellow("Sandbox provisioning failed — writing .env.example"));
      writeEnvExample(targetDir, options.projectName, appSlug, options.port);
      p.log.warn(
        err instanceof Error ? err.message : String(err),
      );
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
      else {
        s.stop(pc.yellow("Docker not available — ensure Postgres is running locally"));
      }
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

  p.outro(
    [
      pc.green(`✓ Created ${options.projectName}`),
      "",
      claimUrl ? `${pc.bold("Claim sandbox:")} ${claimUrl}` : "",
      `${pc.bold("Dev:")} cd ${options.projectName} && bun run dev`,
      `${pc.bold("Open:")} http://localhost:${options.port}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
