// Idempotent tenant + app setup — `bun run setup`
//
// 1. Syncs billing from infi.billing.ts (source of truth)
// 2. Registers the identity app origins for hosted login
import billing from "../infi.billing.js";
import { infi, SLUG, APP_NAME, APP_ORIGIN } from "../src/lib/infi.js";

const appConfig = {
  slug: SLUG,
  name: APP_NAME,
  allowedOrigins: [APP_ORIGIN],
  redirectUris: [`${APP_ORIGIN}/callback`],
};

async function main() {
  const sync = await infi.sync(billing);
  console.log(`billing synced (${sync.actions.length} actions)`);

  const existing = (await infi.apps.list()).find((a) => a.slug === SLUG);
  if (existing?.id) {
    const app = await infi.apps.update(existing.id, {
      name: appConfig.name,
      allowedOrigins: appConfig.allowedOrigins,
      redirectUris: appConfig.redirectUris,
    });
    console.log(`updated app "${app.slug}" (${app.id})`);
  } else {
    const app = await infi.apps.create(appConfig);
    console.log(`created app "${app.slug}" (${app.id})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
