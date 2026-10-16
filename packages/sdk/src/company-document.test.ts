import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { COMPANY_INTENTS, companyFromIntent } from "./company-intents.js";
import { assertValidConfig, fromCompanyDocument, toCompanyDocument } from "./company-document.js";
import type { BillingConfig } from "./billing-as-code.js";

// The server's own schema and fixtures (backend internal/companyconfig), so the
// serializer is checked against what the server reads, not our reading of it.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__/company-v1");
const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
// ESM/CJS interop: the class is the default export or its `.default`.
const Ajv = ((Ajv2020 as unknown as { default?: unknown }).default ?? Ajv2020) as new (o: object) => import("ajv").default;
const ajv = new Ajv({ strict: false });
const validate = ajv.compile(read("company.v1.json"));
const valid = (doc: unknown) => {
  const ok = validate(doc);
  if (!ok) throw new Error(JSON.stringify(validate.errors));
  return ok;
};

describe("toCompanyDocument (schema v1)", () => {
  it.each(COMPANY_INTENTS)("intent %s serializes to a valid document", (intent) => {
    expect(valid(toCompanyDocument(companyFromIntent(intent)))).toBe(true);
  });

  it("round-trips the server's full fixture (pull → file → sync is a no-op)", () => {
    const full = read("full.json");
    const rendered = JSON.parse(JSON.stringify(fromCompanyDocument(full)));
    expect(toCompanyDocument(rendered)).toEqual(full);
  });

  it("the schema itself refuses what the server refuses", () => {
    for (const f of readdirSync(path.join(dir, "invalid"))) {
      expect(validate(read(`invalid/${f}`)), f).toBe(false);
    }
  });

  it("drops nulls instead of sending them", () => {
    const doc = toCompanyDocument({
      products: [{ key: "ebook", type: "item", pricingModel: "one_time", billingCycle: null, basePrice: "19.90", creditsPerCycle: null }],
    });
    expect(doc.products[0]).toEqual({ key: "ebook", type: "item", pricingModel: "one_time", basePrice: "19.90" });
    expect(valid(doc)).toBe(true);
  });

  it("maps the deprecated creditsPerCycle to a cycle grant on the only meter", () => {
    const doc = toCompanyDocument({
      products: [{
        key: "chat", type: "agent", pricingModel: "prepaid", billingCycle: "monthly", basePrice: "10",
        creditsPerCycle: "5000",
        meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
        prices: [{ meter: "tokens", model: "per_unit", unitAmount: "0.01" }],
      }],
    });
    expect(doc.products[0]!.grants).toEqual([{ meter: "tokens", amount: "5000", on: "cycle" }]);
    expect(valid(doc)).toBe(true);
  });

  it("refuses creditsPerCycle without exactly one meter to land on", () => {
    expect(() =>
      toCompanyDocument({ products: [{ key: "c", type: "agent", pricingModel: "prepaid", billingCycle: "monthly", creditsPerCycle: "1" }] }),
    ).toThrow(/needs exactly one declared meter/);
  });
});

describe("assertValidConfig", () => {
  const base = (over: Record<string, unknown>) =>
    ({ products: [{ key: "p", type: "agent", pricingModel: "usage", meters: [{ key: "m", unit: "unit", aggregation: "sum" }], ...over }] }) as unknown as BillingConfig;

  it("price.meter is required and must be declared", () => {
    expect(() => assertValidConfig(base({ prices: [{ model: "flat", unitAmount: "1" }] }))).toThrow(/has no meter/);
    expect(() => assertValidConfig(base({ prices: [{ meter: "x", model: "per_unit" }] }))).toThrow(/does not declare/);
  });

  it("aggregation is sum or count only", () => {
    expect(() => assertValidConfig(base({ meters: [{ key: "m", unit: "unit", aggregation: "max" }] }))).toThrow(/"sum" or "count"/);
  });

  it("one grant per meter per version", () => {
    expect(() =>
      assertValidConfig(base({ grants: [{ meter: "m", amount: "1", on: "cycle" }, { meter: "m", amount: "2", on: "payment" }] })),
    ).toThrow(/one grant per meter/);
  });

  it("webhooks are https only", () => {
    expect(() =>
      assertValidConfig({ products: [], webhooks: [{ url: "http://x.test/h" as never, events: ["payment.confirmed"] }] }),
    ).toThrow(/must be https/);
  });

  it("deliverables, coupons and storefronts are out of v1, with a hint", () => {
    expect(() => assertValidConfig(base({ deliverable: { kind: "link", url: "https://x" } }))).toThrow(/products\.deliverable\.save/);
    expect(() => assertValidConfig({ products: [], coupons: [] } as never)).toThrow(/coupons/);
    expect(() => assertValidConfig({ products: [], storefront: {} } as never)).toThrow(/ADR 0024/);
  });
});
