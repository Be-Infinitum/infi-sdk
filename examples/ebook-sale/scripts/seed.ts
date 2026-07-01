// Idempotent tenant seed — run any number of times. `bun run seed`.
import { defineBilling } from "@beinfi/sdk";
import { infi, PRODUCT_KEY, EBOOK } from "../src/lib/infi";

const config = defineBilling({
  products: [
    {
      key: PRODUCT_KEY,
      name: EBOOK.title,
      type: "item",
      pricingModel: "one_time",
      currency: "BRL",
      prices: [{ model: "flat", unitAmount: EBOOK.priceBRL }],
      deliverable: { kind: "link", url: EBOOK.downloadUrl },
    },
  ],
});

const result = await infi.sync(config);
console.log(JSON.stringify(result, null, 2));
