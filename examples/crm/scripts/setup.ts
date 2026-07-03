// Idempotent tenant + app setup — run any number of times. `npm run setup`.
//
// 1. Syncs the CRM's billing product + `leads_ingested` meter. A product is also
//    required for login: an app login enrolls the identity as a customer of the
//    tenant's product, so with zero products the hosted-login session comes back
//    without a customer and the app bounces to /login.
// 2. Registers (or updates) the identity app with the local origin + callback
//    allowlisted, so hosted login resolves.
import { defineBilling } from "@beinfi/sdk";
import { infi } from "../src/lib/infi";

const slug = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "crm-demo";

const billing = defineBilling({
  products: [
    {
      key: "crm",
      name: "CRM",
      type: "agent",
      pricingModel: "usage",
      currency: "BRL",
      meters: [
        { key: "leads_ingested", displayName: "Leads ingested", unit: "unit", aggregation: "sum" },
      ],
      prices: [{ meter: "leads_ingested", model: "per_unit", unitAmount: "0.10", currency: "BRL" }],
    },
  ],
});

const appConfig = {
  slug,
  name: "CRM Demo",
  allowedOrigins: ["http://localhost:3010"],
  redirectUris: ["http://localhost:3010/callback"],
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
