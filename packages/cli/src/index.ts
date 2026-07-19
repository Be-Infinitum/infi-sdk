import { die } from "./lib/output.js";
import { globalFlags, parseArgs, printHelp } from "./parse.js";
import type { ClaimRef } from "./lib/claim.js";
import type { CompanyIntent } from "@beinfi/sdk";

export { parseArgs, globalFlags, printHelp } from "./parse.js";

export async function run(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed.flags.help || !parsed.command || parsed.command === "help") {
    printHelp();
    return;
  }

  const gf = globalFlags(parsed.flags);

  switch (parsed.command) {
    case "init":
    case "create":
    case "new": {
      const initArgs = argv.slice(argv.indexOf(parsed.command) + 1);
      await (await import("./commands/init.js")).initCommand(initArgs);
      break;
    }

    case "bootstrap":
      await (
        await import("./commands/bootstrap.js")
      ).bootstrapCommand({
        ...gf,
        intent: typeof parsed.flags.intent === "string" ? parsed.flags.intent : undefined,
        ref: typeof parsed.flags.ref === "string" ? (parsed.flags.ref as ClaimRef) : undefined,
        appUrl:
          typeof parsed.flags["app-url"] === "string"
            ? parsed.flags["app-url"]
            : typeof parsed.flags.appUrl === "string"
              ? parsed.flags.appUrl
              : undefined,
        slug: typeof parsed.flags.slug === "string" ? parsed.flags.slug : undefined,
        skipSync: parsed.flags["skip-sync"] === true,
      });
      break;

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

    case "claim": {
      const claim = await import("./commands/claim.js");
      switch (parsed.sub) {
        case "create":
          await claim.claimCreate({
            ...gf,
            ref: (typeof parsed.flags.ref === "string" ? parsed.flags.ref : "cli") as ClaimRef,
            intent:
              typeof parsed.flags.intent === "string"
                ? (parsed.flags.intent as CompanyIntent)
                : undefined,
            appUrl:
              typeof parsed.flags["app-url"] === "string" ? parsed.flags["app-url"] : undefined,
          });
          break;
        case "get":
          await claim.claimGet({
            ...gf,
            id: parsed.positional[0] ?? (typeof parsed.flags.id === "string" ? parsed.flags.id : undefined),
          });
          break;
        default:
          die("Usage: infi claim create|get <id>");
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
        force: parsed.flags.force === true,
        appUrl: typeof parsed.flags["app-url"] === "string" ? parsed.flags["app-url"] : undefined,
      });
      break;

    case "pull":
      await (
        await import("./commands/pull.js")
      ).pullCommand({
        ...gf,
        file: typeof parsed.flags.file === "string" ? parsed.flags.file : parsed.sub,
        force: parsed.flags.force === true,
      });
      break;

    case "doctor":
      await (await import("./commands/doctor.js")).doctorCommand(gf);
      break;

    case "go-live":
      await (
        await import("./commands/go-live.js")
      ).goLiveCommand({
        ...gf,
        claimId:
          typeof parsed.flags["claim-id"] === "string"
            ? parsed.flags["claim-id"]
            : typeof parsed.flags.claimId === "string"
              ? parsed.flags.claimId
              : undefined,
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
