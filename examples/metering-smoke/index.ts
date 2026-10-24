/**
 * Metering smoke test against the sandbox, end to end through @beinfi/sdk:
 * sync a prepaid product → enroll → grant credit → infi.meter (gate + record)
 * → track / session batch → usage + state → exhaust the wallet and expect 402.
 *
 * Usage:
 *   bun run examples/metering-smoke/index.ts
 *   INFI_SECRET_KEY=sk_test_xxx bun run examples/metering-smoke/index.ts
 *
 * Without INFI_SECRET_KEY it claims a fresh sandbox tenant.
 */
import { Infi, InsufficientCreditError, defineCompany } from "../../packages/sdk/src/index.ts";

const API = process.env.INFI_API_URL?.replace(/\/$/, "") ?? "https://api-sandbox.beinfi.com";
const PRODUCT_KEY = "metering-smoke";
const METER = "tokens";

const company = defineCompany({
  products: [
    {
      key: PRODUCT_KEY,
      name: "Metering Smoke",
      type: "agent",
      pricingModel: "prepaid",
      billingCycle: "monthly",
      currency: "BRL",
      basePrice: "19.90",
      meters: [
        { key: METER, unit: "token", aggregation: "sum" },
        { key: "requests", unit: "request", aggregation: "count" },
      ],
      prices: [
        { meter: METER, model: "per_unit", unitAmount: "0.01" },
        { meter: "requests", model: "per_unit", unitAmount: "0.005" },
      ],
    },
  ],
});

const step = (s: string) => console.log(`\n── ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fake LLM call shaped like an OpenAI response so infi.meter auto-extracts tokens. */
const fakeLLM = async (tokens: number) => ({ usage: { total_tokens: tokens } });

async function main() {
  step("0. Key");
  let key = process.env.INFI_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) {
    const res = await fetch(`${API}/public/v1/claimables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "cli" }),
    });
    if (!res.ok) throw new Error(`claim ${res.status}: ${await res.text()}`);
    const claim = (await res.json()) as { id: string; apiKeySecret: string; claimUrl: string };
    key = claim.apiKeySecret;
    console.log(`claimed tenant ${claim.id}\n  key:   ${key}\n  claim: ${claim.claimUrl}`);
  } else {
    console.log(`using ${key.slice(0, 14)}…`);
  }

  const infi = new Infi({ secretKey: key, ...(process.env.INFI_API_URL ? { apiUrl: API } : {}) });
  console.log(`mode=${infi.mode} api=${infi.apiBase}`);

  step("1. Sync product");
  const sync = await infi.sync(company);
  console.log(sync.actions.map((a) => `${a.action}:${a.resource}`).join(", ") || "no changes");
  const product = (await infi.products.list()).find((p) => p.key === PRODUCT_KEY);
  if (!product?.id) throw new Error(`product ${PRODUCT_KEY} not found after sync`);
  console.log(`product ${product.id}`);

  step("2. Enroll customer");
  const externalId = `smoke_${Date.now()}`;
  const enrollment = await infi.products.enroll(product.id, { externalId, email: "smoke@example.com" });
  const enrollmentId = enrollment.id!;
  console.log(`enrollment ${enrollmentId} (externalId ${externalId})`);

  step("3. Grant credit");
  const wallet = infi.wallet.bind(enrollmentId, { defaultMeter: METER });
  const balance = async () => (await wallet.balance()).balance;
  console.log("before:", await balance());
  console.log("after grant:", (await wallet.credit(METER, "1000", { reason: "smoke" })).balance);

  const windowStart = new Date(Date.now() - 60_000).toISOString();

  step("4. infi.meter (prepaid: gate + record)");
  await infi.meter({ enrollmentId, productId: product.id, meter: METER }, () => fakeLLM(120));
  console.log("recorded 120 tokens");

  step("5. infi.track + session batch");
  console.log(await infi.track({ customerId: enrollmentId, productId: product.id, meter: "requests", value: "1" }));
  const s = infi.session(enrollmentId, product.id).track(METER, 80).track("requests", 1);
  console.log(await s.flush());

  // UsageDebitJob debits closed 1-min windows with a 30s lag, so allow ~3 min.
  step("6. Usage + wallet drawdown (async — polling up to 3 min)");
  let drawn = false;
  for (let i = 0; i < 18; i++) {
    const usage = await infi.usage.get({ customerId: enrollmentId, from: windowStart });
    const bal = await balance();
    const meters = usage.meters?.map((m) => `${m.meter}=${Number(m.totalValue)}`).join(" ");
    console.log(`  t+${i * 10}s usage[${meters}] balance=${bal}`);
    if (Number(bal) < 1000) {
      drawn = true;
      break;
    }
    await sleep(10_000);
  }
  if (!drawn) {
    // UsageDebitJob only debits meters with a meter_consumption_rates row, and
    // `infi.sync` publishes prepaid versions without one.
    console.log("✗ wallet never drew down — the published version has no consumption rate");
    process.exitCode = 1;
  }
  console.log("state:", JSON.stringify(await infi.customers.state(enrollmentId), null, 2));

  step("7. Exhaust wallet → expect InsufficientCreditError");
  const left = await balance();
  if (Number(left) > 0) await wallet.debit(METER, left, { reason: "smoke-drain" });
  console.log("balance now:", await balance());
  try {
    await infi.meter({ enrollmentId, productId: product.id, meter: METER }, () => fakeLLM(10));
    console.log("✗ meter was NOT gated");
    process.exitCode = 1;
  } catch (err) {
    if (err instanceof InsufficientCreditError) console.log("✓ gated:", err.message);
    else throw err;
  }
}

main().catch((err) => {
  console.error("\n✗", err);
  process.exit(1);
});
