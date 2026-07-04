// Dry-run billing sync — `bun run plan`
import billing from "../infi.billing.js";
import { infi } from "../src/lib/infi.js";

const result = await infi.sync(billing, { plan: true });
console.log(JSON.stringify(result, null, 2));
