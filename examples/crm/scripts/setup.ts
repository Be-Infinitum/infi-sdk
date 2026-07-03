// Idempotent app provisioning — run any number of times. `npm run setup`.
//
// Registers (or updates) the identity app this CRM logs into, with the local
// origin + callback allowlisted, so hosted login works. Without this the
// backend has no app for the slug and the hosted login page 404s.
import { infi } from "../src/lib/infi";

const slug = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "crm-demo";
const config = {
  slug,
  name: "CRM Demo",
  allowedOrigins: ["http://localhost:3010"],
  redirectUris: ["http://localhost:3010/callback"],
};

async function main() {
  const existing = (await infi.apps.list()).find((a) => a.slug === slug);
  if (existing?.id) {
    const app = await infi.apps.update(existing.id, {
      name: config.name,
      allowedOrigins: config.allowedOrigins,
      redirectUris: config.redirectUris,
    });
    console.log(`updated app "${app.slug}" (${app.id})`);
  } else {
    const app = await infi.apps.create(config);
    console.log(`created app "${app.slug}" (${app.id})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
