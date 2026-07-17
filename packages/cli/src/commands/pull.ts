import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { buildLock, type BillingConfig } from "@beinfi/sdk";
import type { GlobalFlags } from "../lib/client.js";
import { infiClient } from "../lib/client.js";
import { die, ok } from "../lib/output.js";
import { lockPathFor, writeLock } from "./sync.js";

const CONFIG_FILE = "infi.billing.ts";

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "product"
  );
}

/** Drop null/undefined keys so the generated config stays clean. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) out[k] = v;
  return out as Partial<T>;
}

/** Read the whole catalog and shape it into a defineBilling() config. */
async function pullConfig(infi: ReturnType<typeof infiClient>): Promise<BillingConfig> {
  const products = await infi.products.list();
  const out: BillingConfig["products"] = [];

  for (const prod of products) {
    if (!prod.id) continue;
    const [meters, versions] = await Promise.all([
      infi.products.meters.list(prod.id),
      infi.products.versions.list(prod.id),
    ]);
    const published = [...versions].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    const current = published.find((v) => v.status === "published") ?? published[0];
    const prices = current?.id ? await infi.products.prices.list(prod.id, current.id) : [];
    const idToKey = new Map(meters.filter((m) => m.id && m.name).map((m) => [m.id!, m.name!] as const));

    out.push(
      compact({
        key: prod.key ?? slug(prod.name ?? "product"),
        name: prod.name,
        type: prod.type,
        pricingModel: prod.pricingModel,
        currency: prod.currency,
        billingCycle: current?.billingCycle,
        basePrice: current?.basePrice,
        creditsPerCycle: current?.creditsPerCycle,
        meters: meters.length
          ? meters.map((m) =>
              compact({ key: m.name, displayName: m.displayName, unit: m.unit, aggregation: m.aggregation }),
            )
          : undefined,
        prices: prices.length
          ? prices.map((pr) =>
              compact({
                meter: pr.meterId ? idToKey.get(pr.meterId) : undefined,
                model: pr.model,
                unitAmount: pr.unitAmount,
                currency: pr.currency,
                tiers: pr.tiers,
              }),
            )
          : undefined,
      }) as BillingConfig["products"][number],
    );
  }

  return { products: out };
}

function renderConfig(config: BillingConfig): string {
  return `import { defineBilling } from "@beinfi/sdk";\n\nexport default defineBilling(${JSON.stringify(config, null, 2)});\n`;
}

export async function pullCommand(
  flags: GlobalFlags & { file?: string; force?: boolean },
): Promise<void> {
  const file = path.resolve(flags.file ?? CONFIG_FILE);
  if (fs.existsSync(file) && !flags.force) {
    die(`${path.relative(process.cwd(), file)} already exists. Re-run with --force to overwrite.`);
  }

  const infi = infiClient(flags);
  const config = await pullConfig(infi);
  if (!config.products.length) die("No products found for this tenant.");

  fs.writeFileSync(file, renderConfig(config));
  const lockPath = lockPathFor(file);
  writeLock(lockPath, await buildLock(infi, config));

  ok(`Pulled ${config.products.length} product(s)`);
  console.log(`  config: ${path.relative(process.cwd(), file)}`);
  console.log(`  lock:   ${path.relative(process.cwd(), lockPath)}`);
  console.log(pc.dim("Commit both — the next `infi sync` starts from this baseline."));
}
