import path from "node:path";
import { assertValidConfig, assertValidManifest } from "@beinfi/sdk";
import { describe, expect, it } from "vitest";

describe("the Ecommerce template's manifest", () => {
  it("is valid as shipped: known schema, prefixed keys, a store shelving its own products", async () => {
    const mod = await import(path.resolve(__dirname, "../../../../templates/ecommerce/infi.company.ts"));
    // As scaffolded: `infi init` fills the store slug from the project name.
    const manifest = { ...mod.default, storefront: { ...mod.default.storefront, slug: "minha-loja" } };
    expect(() => assertValidManifest(manifest)).not.toThrow();
    expect(() => assertValidConfig(manifest)).not.toThrow();
    expect(manifest.template).toEqual({ id: "ecommerce", version: "1.0.0" });
    expect(manifest.products.map((p: { pricingModel: string }) => p.pricingModel).sort()).toEqual(["one_time", "subscription"]);
    expect(manifest.coupons.some((c: { sandboxOnly?: boolean }) => c.sandboxOnly)).toBe(true);
  });
});
