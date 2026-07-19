// Idempotent tenant + app setup — run any number of times. `bun run seed`.
import { defineBilling } from "@beinfi/sdk";
import { infi, PRODUCT_KEY, PACK_CREDITS, SLUG, APP_URL } from "../server/infi.js";

const config = defineBilling({
  products: [
    {
      key: PRODUCT_KEY,
      name: "AI Chat",
      type: "agent",
      pricingModel: "prepaid",
      billingCycle: "monthly",
      currency: "BRL",
      basePrice: "19.90",
      meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
      prices: [{ meter: "tokens", model: "prepaid_credits", unitAmount: "0.01" }],
    },
  ],
  apps: [
    {
      slug: SLUG,
      name: "AI Chat Demo",
      allowedOrigins: [APP_URL],
      redirectUris: [`${APP_URL}/callback`],
    },
  ],
});

async function main() {
  const sync = await infi.sync(config);
  console.log(`billing synced (${sync.actions.length} actions)`);
  console.log(`Pack grants ${PACK_CREDITS} credits on payment.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
