// Idempotent tenant + app setup — run any number of times. `bun run setup`.
import { defineBilling } from "@beinfi/sdk";
import { infi, SLUG, APP_NAME, APP_ORIGIN, PRODUCT_KEY } from "../src/lib/infi";

const billing = defineBilling({
  products: [
    {
      key: PRODUCT_KEY,
      name: `${APP_NAME} Starter`,
      type: "agent",
      pricingModel: "prepaid",
      billingCycle: "monthly",
      currency: "BRL",
      basePrice: "29.90",
      meters: [{ key: "usage_events", displayName: "Usage events", unit: "event", aggregation: "sum" }],
      prices: [{ meter: "usage_events", model: "prepaid_credits", unitAmount: "0.01" }],
    },
  ],
});

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
