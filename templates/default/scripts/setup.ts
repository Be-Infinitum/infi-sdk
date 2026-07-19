// Idempotent tenant setup — `bun run setup`
//
// Syncs billing + identity app from infi.billing.ts (single source of truth).
import billing from "../infi.billing.js";
import { infi } from "../src/lib/infi.js";

async function main() {
  const sync = await infi.sync(billing);
  console.log(`billing synced (${sync.actions.length} actions)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
