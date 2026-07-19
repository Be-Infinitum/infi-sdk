// Idempotent tenant + app setup — run any number of times. `npm run setup`.
import { defineBilling } from "@beinfi/sdk";
import { infi } from "../src/lib/infi";

const slug = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "crm-demo";
const origin = "http://localhost:3010";

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
  apps: [
    {
      slug,
      name: "CRM Demo",
      allowedOrigins: [origin],
      redirectUris: [`${origin}/callback`],
    },
  ],
});

async function main() {
  const sync = await infi.sync(billing);
  console.log(`billing synced (${sync.actions.length} actions)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
