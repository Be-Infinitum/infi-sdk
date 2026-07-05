import { die } from "./lib/output.js";
import { globalFlags, parseArgs, printHelp } from "./parse.js";

export { parseArgs, globalFlags, printHelp } from "./parse.js";

export async function run(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed.flags.help || !parsed.command || parsed.command === "help") {
    printHelp();
    return;
  }

  const gf = globalFlags(parsed.flags);

  switch (parsed.command) {
    case "login":
      await (
        await import("./commands/login.js")
      ).loginCommand({
        ...gf,
        token: typeof parsed.flags.token === "string" ? parsed.flags.token : undefined,
        tenant: typeof parsed.flags.tenant === "string" ? parsed.flags.tenant : undefined,
        profile: typeof parsed.flags.profile === "string" ? parsed.flags.profile : undefined,
      });
      break;

    case "keys": {
      const keys = await import("./commands/keys.js");
      switch (parsed.sub) {
        case "list":
          await keys.keysList(gf);
          break;
        case "create":
          await keys.keysCreate({
            ...gf,
            kind: parsed.flags.kind === "publishable" ? "publishable" : "secret",
          });
          break;
        case "revoke": {
          const id = parsed.positional[0];
          if (!id) die("Usage: infi keys revoke <key-id>");
          await keys.keysRevoke({ ...gf, id });
          break;
        }
        default:
          die("Usage: infi keys list|create|revoke");
      }
      break;
    }

    case "sandbox": {
      const sandbox = await import("./commands/sandbox.js");
      switch (parsed.sub) {
        case "create":
          await sandbox.sandboxCreate({
            ...gf,
            ref: typeof parsed.flags.ref === "string" ? (parsed.flags.ref as "cli") : "cli",
          });
          break;
        case "get":
          await sandbox.sandboxGet({
            ...gf,
            id: parsed.positional[0] ?? (typeof parsed.flags.id === "string" ? parsed.flags.id : undefined),
          });
          break;
        default:
          die("Usage: infi sandbox create|get <id>");
      }
      break;
    }

    case "sync":
      await (
        await import("./commands/sync.js")
      ).syncCommand({
        ...gf,
        file: parsed.sub,
        plan: parsed.flags.plan === true,
      });
      break;

    case "deploy":
      await (
        await import("./commands/deploy.js")
      ).deployCommand({
        ...gf,
        url: typeof parsed.flags.url === "string" ? parsed.flags.url : undefined,
        vercel: parsed.sub === "vercel" || parsed.flags.vercel === true,
        prod: parsed.flags.prod === true,
        skipWebhook: parsed.flags["skip-webhook"] === true,
        skipEnv: parsed.flags["skip-env"] === true,
      });
      break;

    default:
      die(`Unknown command: ${parsed.command}. Run \`infi --help\`.`);
  }
}

run(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
