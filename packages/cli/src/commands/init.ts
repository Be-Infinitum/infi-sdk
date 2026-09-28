import * as p from "@clack/prompts";
import pc from "picocolors";
import path from "node:path";
import fs from "node:fs";
import { scaffold } from "../lib/scaffold.js";
import {
  DEFAULT_PORT,
  TEMPLATE_META,
  slugFromName,
  validateProjectName,
  writeEnvExample,
  type TemplateId,
} from "../lib/init-support.js";
import { runInstall } from "../lib/run-setup.js";
import { login } from "./login.js";
import { syncCommand } from "./sync.js";

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
  local: boolean;
  yes: boolean;
  device: boolean;
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
    else if (arg === "--local") out.local = true;
    else if (arg === "--device") out.device = true;
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
  --template <id>     Template: ecommerce
  --port <n>          Dev server port (default: 3000)
  --local             Use local Infi API (:8088)
  --device            Log in with a code instead of the browser (agents)
  --skip-provision    Do not log in or seed (run \`infi login && infi sync\` later)
  --skip-install      Skip package install
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
  template = template ?? "ecommerce";
  if (!(template in TEMPLATE_META)) {
    p.cancel(`Unknown template "${template}". Available: ${Object.keys(TEMPLATE_META).join(", ")}.`);
    return null;
  }

  const port = parsed.port ?? DEFAULT_PORT;

  const cwd = process.cwd();

  return {
    projectName,
    template,
    port,
    cwd,
    skipProvision: parsed.skipProvision ?? false,
    skipInstall: parsed.skipInstall ?? false,
    local: parsed.local ?? false,
    yes: parsed.yes ?? false,
    device: parsed.device ?? false,
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

  // Nothing written so far carries a key: the template ships .env.example.
  writeEnvExample(targetDir, options.port);

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

  // No anonymous tenant (decisoes.md): the person logs in — or signs up — in
  // the browser, and this project gets its own sk_test_ on their sandbox.
  let seeded = false;
  if (!options.skipProvision) {
    const here = process.cwd();
    process.chdir(targetDir);
    try {
      p.log.step("Entrando na sua conta Infi (sem conta? o navegador leva ao cadastro)…");
      const who = await login({ local: options.local, device: options.device });
      p.log.success(`${who.email} · ${who.tenant.slug} (sandbox) — chave ${who.keyName ?? "do projeto"}`);
      p.log.step("Semeando o catálogo do template no seu sandbox…");
      await syncCommand({ local: options.local });
      seeded = process.exitCode !== 2;
    } catch (err) {
      p.log.warn(err instanceof Error ? err.message : String(err));
      p.log.info("Rode depois, dentro do projeto: `infi login && infi sync`.");
    } finally {
      process.chdir(here);
    }
  }

  const steps = [
    `${pc.cyan("cd")} ${options.projectName}`,
    ...(options.skipProvision || !seeded ? [`${pc.cyan("infi login && infi sync")}`] : []),
    `${pc.cyan("npm run dev")}`,
    pc.dim(`→ http://localhost:${options.port}`),
  ].join("\n");
  p.note(steps, pc.bold("Next steps"));

  p.outro(`${pc.green("✓")} ${pc.bold(options.projectName)} is ready. ${pc.dim("Happy building.")}`);
}
