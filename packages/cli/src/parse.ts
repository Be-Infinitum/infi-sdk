import pc from "picocolors";

export function printHelp(): void {
  console.log(`
${pc.bold("infi")} — Infi operator CLI (company as code)

${pc.dim("Usage:")}
  infi bootstrap --intent <crm|prepaid-ai-chat|one-time|usage-saas> [--ref <channel>] [--json]
  infi login [--token <session>] [--tenant <slug>] [--profile name]
  infi keys list|create|revoke [--key sk_...] [--json]
  infi providers [list] [--json]                # BYOP connection status
  infi providers verify <stripe|asaas> [--json] # re-check a stored credential
  infi claim create|get <id> [--ref cli] [--local] [--json]
  infi sync [file] [--plan] [--force] [--key sk_...] [--local] [--json]
  infi pull [file] [--force]   # generate infi.company.ts + lock from the backend
  infi doctor [--key sk_...] [--local] [--json]
  infi go-live [--claim-id <id>] [--json]       # claim → connect provider → webhook
  infi deploy [--url <app-url>] [--vercel] [--prod] [--json]
  infi deploy vercel [--prod]   # deploy + sync env + register webhook

${pc.dim("Global flags:")}
  --key <sk_...>       Secret key (or INFI_SECRET_KEY / saved profile)
  --profile <name>     Config profile (~/.config/infi/config.json)
  --local              Use http://localhost:8088
  --json               JSON output
  -h, --help           Show help

${pc.dim("Examples:")}
  infi bootstrap --intent crm --ref lovable --json
  infi claim create --ref cursor --json
  infi sync infi.company.ts --plan
  infi doctor --json
  infi providers list
  infi go-live --json

${pc.dim("Note:")}
  API and app hosts are inferred from the key: sk_test_ → api-sandbox/app-sandbox.beinfi.com,
  sk_live_ → api/app.beinfi.com. With no key at all, provisioning uses sandbox.
  Beinfi does not do end-user login — bring your own auth and pass your own user id.
  Connecting a provider needs fresh MFA, so it is a dashboard action, not a CLI one.
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
