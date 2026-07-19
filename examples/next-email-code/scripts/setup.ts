// Idempotent tenant + app setup — run any number of times. `bun run setup`.
import { Infi, defineBilling } from "@beinfi/sdk";

const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY,
  apiUrl: process.env.INFI_API_URL,
});

const slug = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "sdk-test";
const origin = "http://localhost:3009";

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
  apps: [
    {
      slug,
      name: "Email Code Demo",
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
