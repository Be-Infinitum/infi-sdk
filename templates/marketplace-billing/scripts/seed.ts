// Idempotent tenant seed + org onboarding — `bun run setup` (alias `bun run seed`, tsx).
//
// 1. sync the `integration` product (3 meters + per-unit base prices), published.
//    A product is also required for login: hosted login enrolls the identity as a
//    customer of the tenant's product, so with zero products the login session comes
//    back without a customer and the app bounces to /login.
// 2. Register (or update) the identity app with the local origin + callback
//    allowlisted, so hosted login resolves.
// 3. For each org: enroll -> set a full per-meter rate-card -> subscribe with a
//    backdated anchor so the first monthly period is already ended (invoiceable now).
// 4. Persist the id trio (enrollment/subscription/period) in Prisma for the dashboard.
import { defineBilling } from "@beinfi/sdk";
import { infi } from "../src/lib/infi.js";
import {
  PRODUCT_KEY,
  CURRENCY,
  METERS,
  ORGS,
  BACKDATE_DAYS,
} from "../src/lib/config.js";
import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const slug = process.env.NEXT_PUBLIC_INFI_APP_SLUG ?? "marketplace-demo";
const origin = "http://localhost:3013";

async function main() {
  const config = defineBilling({
    products: [
      {
        key: PRODUCT_KEY,
        name: "Integration",
        type: "agent",
        pricingModel: "subscription",
        currency: CURRENCY,
        billingCycle: "monthly",
        meters: METERS.map((m) => ({
          key: m.key,
          displayName: m.displayName,
          unit: "unit",
          aggregation: "sum",
        })),
        prices: METERS.map((m) => ({
          meter: m.key,
          model: "per_unit",
          unitAmount: m.basePrice,
          currency: CURRENCY,
        })),
      },
    ],
    apps: [
      {
        slug,
        name: "Marketplace Billing Demo",
        allowedOrigins: [origin],
        redirectUris: [`${origin}/callback`],
      },
    ],
  });
  const syncResult = await infi.sync(config);
  console.log("sync:", JSON.stringify(syncResult.actions));

  // Resolve the product + meter ids.
  const product = (await infi.products.list()).find((p) => p.key === PRODUCT_KEY);
  if (!product?.id) throw new Error("product not found after sync");
  const meters = await infi.products.meters.list(product.id);
  const meterIdByKey = new Map(meters.map((m) => [m.name ?? "", m.id!]));

  // Backdate so the first monthly period is already ended.
  const anchor = new Date(Date.now() - BACKDATE_DAYS * 86_400_000).toISOString();

  await prisma.org.deleteMany();

  for (const org of ORGS) {
    // 2a. Enroll -> the enrollment id used by rate-cards/usage/subscription/invoicing.
    const enrollment = await infi.products.enroll(product.id, {
      externalId: org.externalId,
      name: org.name,
      email: org.email,
    });
    const enrollmentId = enrollment.id!;

    // 2b. Full per-meter rate-card (per-org pricing — the headline feature).
    for (const m of METERS) {
      await infi.customers.rateCards.set(enrollmentId, {
        meterId: meterIdByKey.get(m.key)!,
        model: "per_unit",
        unitAmount: org.rates[m.key],
        currency: CURRENCY,
      });
    }

    // 2c. Subscribe with the backdated anchor. Reuse an existing subscription on
    //     re-seed instead of stacking duplicates.
    const existing = await infi.subscriptions.listForCustomer(enrollmentId);
    let subscriptionId: string;
    let periodStart: string;
    let periodEnd: string;
    if (existing.length > 0) {
      subscriptionId = existing[0].id!;
      // The dashboard window: the backdated month.
      periodStart = existing[0].anchor ?? anchor;
      const start = new Date(periodStart);
      periodEnd = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate()).toISOString();
    } else {
      const { subscription, period } = await infi.products.subscribe(product.id, {
        enrollmentId,
        anchor,
      });
      subscriptionId = subscription.id!;
      periodStart = period.periodStart!;
      periodEnd = period.periodEnd!;
    }

    await prisma.org.create({
      data: {
        externalId: org.externalId,
        name: org.name,
        tier: org.tier,
        email: org.email,
        productId: product.id,
        enrollmentId,
        subscriptionId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
      },
    });
    console.log(`onboarded ${org.name} (${org.tier}) -> sub ${subscriptionId}`);
  }

  console.log(`\nSeeded ${ORGS.length} orgs. Now run \`bun run ingest\`.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
