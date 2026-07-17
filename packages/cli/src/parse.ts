import pc from "picocolors";

export function printHelp(): void {
  console.log(`
${pc.bold("infi")} — Infi operator CLI (TypeScript)

${pc.dim("Usage:")}
  infi init [project-name] [--template <id>] [--port <n>] [--local] [-y]
  infi login [--token <session>] [--tenant <slug>] [--profile name]
  infi keys list|create|revoke [--key sk_...] [--json]
  infi sandbox create|get <id> [--ref cli] [--local] [--json]
  infi sync [file] [--plan] [--force] [--key sk_...] [--local] [--json]
  infi pull [file] [--force]   # generate infi.billing.ts + lock from the backend
  infi deploy [--url <app-url>] [--vercel] [--prod] [--json]
  infi deploy vercel [--prod]   # deploy + sync env + register webhook

${pc.dim("Global flags:")}
  --key <sk_...>       Secret key (or INFI_SECRET_KEY / saved profile)
  --profile <name>     Config profile (~/.config/infi/config.json)
  --local              Use http://localhost:8088
  --json               JSON output
  -h, --help           Show help

${pc.dim("Examples:")}
  infi init my-app --template ai-chat
  infi sandbox create --json
  infi keys create --key sk_test_...
  infi sync infi.billing.ts --plan
  infi deploy --url https://my-app.vercel.app
  infi deploy vercel --prod
  infi login --token eyJ...

${pc.dim("Scaffold a new app:")}
  npm create infi-app my-app
`);
}

export type ParsedArgs = {
  help?: boolean;
  command?: string;
  sub?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--local") flags.local = true;
    else if (arg === "--plan") flags.plan = true;
    else if (arg === "--force") flags.force = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    command: positional[0],
    sub: positional[1],
    positional: positional.slice(2),
    flags,
  };
}

export function globalFlags(flags: Record<string, string | boolean>) {
  return {
    key: typeof flags.key === "string" ? flags.key : undefined,
    profile: typeof flags.profile === "string" ? flags.profile : undefined,
    local: flags.local === true,
    json: flags.json === true,
  };
}
