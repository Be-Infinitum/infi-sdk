// Simulated event stream — `bun run ingest` (tsx).
//
// Emits the SAME event volume for every org (so the invoice difference is purely the
// rate-card delta). Events are timestamped inside each org's backdated period so they
// aggregate into the invoice that `generateFromSubscription` will produce.
//
// Note the id discipline: metering keys on the org's EXTERNAL id (`customerId`), while
// rate-cards / usage / invoicing key on the ENROLLMENT id. Easy to get wrong.
import type { UsageEvent } from "@beinfi/sdk";
import { infi } from "../src/lib/infi.js";
import { METERS, EVENTS_PER_METER } from "../src/lib/config.js";
import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();
const BATCH = 500;

async function main() {
  const orgs = await prisma.org.findMany();
  if (orgs.length === 0) throw new Error("no orgs — run `bun run seed` first");

  for (const org of orgs) {
    // One day into the period — safely inside the [start, end) window.
    const ts = new Date(org.periodStart.getTime() + 86_400_000).toISOString();

    const events: UsageEvent[] = [];
    for (const m of METERS) {
      const n = EVENTS_PER_METER[m.key];
      for (let i = 0; i < n; i++) {
        events.push({
          productId: org.productId,
          customerId: org.externalId, // EXTERNAL id for metering
          meter: m.key,
          value: "1",
          eventId: `${org.externalId}-${m.key}-${i}`, // idempotent: re-ingest is a no-op
          timestamp: ts,
        });
      }
    }

    for (let i = 0; i < events.length; i += BATCH) {
      await infi.trackBatch(events.slice(i, i + BATCH));
    }
    console.log(`${org.name}: sent ${events.length} events`);
  }

  console.log("\nDone. Open the dashboard and hit “Fechar período e faturar”.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
