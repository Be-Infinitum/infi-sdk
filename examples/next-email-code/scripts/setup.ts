// Idempotent tenant + app setup — run any number of times. `bun run setup`.
//
// 1. Syncs a minimal billing product + `email_sends` meter. A product is also
//    required for login: an app login enrolls the identity as a customer of the
//    tenant's product, so with zero products the hosted-login session comes back
//    without a customer and the app bounces to /login.
// 2. Registers (or updates) the identity app with the local origin + callback
//    allowlisted, so hosted (and embedded) login resolves.
import { Infi, defineBilling } from "@beinfi/sdk";

const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY,
  apiUrl: process.env.INFI_API_URL,
});

const slug = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "sdk-test";

const billing = defineBilling({
  products: [
    {
      key: "email-code-demo",
      name: "Email Code Demo",
      type: "agent",
      pricingModel: "usage",
      currency: "BRL",
      meters: [
        { key: "email_sends", displayName: "Email sends", unit: "unit", aggregation: "sum" },
      ],
      prices: [{ meter: "email_sends", model: "per_unit", unitAmount: "0.10", currency: "BRL" }],
    },
  ],
});

const appConfig = {
  slug,
  name: "Email Code Demo",
  allowedOrigins: ["http://localhost:3009"],
  redirectUris: ["http://localhost:3009/callback"],
};

async function main() {
  const sync = await infi.sync(billing);
  console.log(`billing synced (${sync.actions.length} actions)`);

  const existing = (await infi.apps.list()).find((a) => a.slug === slug);
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
