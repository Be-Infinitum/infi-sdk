// Idempotent tenant seed — `bun run seed`.
import { defineBilling } from "@beinfi/sdk";
import { infi, PRODUCT_KEY, PACK_CREDITS } from "../server/infi.js";

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

const result = await infi.sync(config);
console.log(JSON.stringify(result, null, 2));
console.log(`Pack grants ${PACK_CREDITS} credits on payment.`);
