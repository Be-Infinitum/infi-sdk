// Thin shim so `npm create infi-app` keeps working. All scaffolding logic lives
// in @beinfi/cli (`infi init`); this just forwards to it. See ADR 0003.
import { initCommand } from "@beinfi/cli/commands/init";

initCommand(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
