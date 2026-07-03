// Idempotent tenant + app setup — run any number of times. `bun run seed`.
//
// 1. Syncs the ai-chat billing product (prepaid + `tokens` meter). A product is
//    also required for login: an app login enrolls the identity as a customer of
//    the tenant's product, so with zero products the hosted-login session comes
//    back without a customer and the app bounces to the login screen.
// 2. Registers (or updates) the identity app with the SPA origin + callback
//    allowlisted, so hosted login (`buildHostedLoginUrl` → the Infi frontend)
//    resolves back to this app.
import { defineBilling } from "@beinfi/sdk";
import { infi, PRODUCT_KEY, PACK_CREDITS, SLUG, APP_URL } from "../server/infi.js";

const config = defineBilling({
  products: [
    {
      key: PRODUCT_KEY,
      name: "AI Chat",
      type: "agent",
      pricingModel: "prepaid",
      currency: "BRL",
      // Pack price for checkout (auto-derived), grants PACK_CREDITS on payment.
      basePrice: "19.90",
      meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
      prices: [{ meter: "tokens", model: "prepaid_credits", unitAmount: "0.01" }],
    },
  ],
});

// The SPA origin (APP_URL) is where hosted login redirects back to; its /callback
// route is proxied by Vite to the Hono API, which exchanges the code.
const appConfig = {
  slug: SLUG,
  name: "AI Chat Demo",
  allowedOrigins: [APP_URL],
  redirectUris: [`${APP_URL}/callback`],
};

async function main() {
  const sync = await infi.sync(config);
  console.log(`billing synced (${sync.actions.length} actions)`);
  console.log(`Pack grants ${PACK_CREDITS} credits on payment.`);

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
