import { describe, expect, it, vi } from "vitest";
import { defineBilling, syncBilling, type BillingConfig } from "./billing-as-code.js";
import type { Infi } from "./client.js";
import { InfiError } from "./errors.js";
import { SchemaVersionError, assertValidManifest, modeOfKey, suggestSlug } from "./template-manifest.js";

/** Just enough of Infi for a template sync: products, coupons, storefronts, deliverables. */
function fakeInfi(opts: { products?: any[]; coupons?: any[]; takenSlugs?: string[] } = {}) {
  let seq = 1;
  const state = {
    products: opts.products ?? [],
    versions: {} as Record<string, any[]>,
    coupons: opts.coupons ?? [],
    storefronts: [] as any[],
    shelves: {} as Record<string, any[]>,
    uploads: 0,
    saves: [] as any[],
  };
  const taken = new Set(opts.takenSlugs ?? []);
  const infi = {
    products: {
      list: vi.fn(async () => state.products),
      create: vi.fn(async (input: any) => {
        const p = { id: `prod_${seq++}`, ...input };
        state.products.push(p);
        state.versions[p.id] = [];
        return p;
      }),
      update: vi.fn(async (id: string, patch: any) => Object.assign(state.products.find((p) => p.id === id), patch)),
      meters: { list: vi.fn(async () => []), create: vi.fn(), update: vi.fn() },
      versions: {
        list: vi.fn(async (id: string) => state.versions[id] ?? []),
        create: vi.fn(async (id: string, input: any) => {
          const v = { id: `v_${seq++}`, version: 1, status: "draft", ...input };
          (state.versions[id] ??= []).push(v);
          return v;
        }),
        publish: vi.fn(async (_id: string, vid: string) => {
          for (const vs of Object.values(state.versions)) for (const v of vs) if (v.id === vid) v.status = "published";
          return {};
        }),
      },
      prices: { list: vi.fn(async () => []), add: vi.fn() },
      deliverable: {
        save: vi.fn(async (_id: string, input: any) => {
          state.saves.push(input);
          return {};
        }),
        presign: vi.fn(async () => ({ uploadUrl: "https://r2.test/put", objectKey: `obj_${seq++}` })),
      },
    },
    coupons: {
      list: vi.fn(async () => state.coupons),
      create: vi.fn(async (input: any) => {
        state.coupons.push(input);
        return input;
      }),
    },
    storefronts: {
      list: vi.fn(async () => state.storefronts),
      create: vi.fn(async (input: any) => {
        if (taken.has(input.slug)) throw new InfiError("slug taken", 409, "slug_taken");
        const s = { id: `sf_${seq++}`, url: `https://x/${input.slug}`, ...input };
        state.storefronts.push(s);
        return s;
      }),
      setShelf: vi.fn(async (id: string, items: any[]) => {
        state.shelves[id] = items;
        return items;
      }),
    },
    webhooks: { list: vi.fn(async () => []) },
  };
  const fetchImpl = vi.fn(async () => {
    state.uploads++;
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  return { infi: infi as unknown as Infi, state, fetchImpl };
}

const ECOMMERCE: BillingConfig = defineBilling({
  schemaVersion: 1,
  template: { id: "ecommerce", version: "1.0.0" },
  products: [
    {
      key: "ecommerce/ebook",
      name: "Ebook",
      type: "item",
      pricingModel: "one_time",
      currency: "BRL",
      basePrice: "49.90",
      guaranteeDays: 7,
      deliverable: { kind: "file", path: "./assets/ebook.pdf" },
    },
  ],
  coupons: [
    { code: "LANCAMENTO", percentOff: "20", duration: "once" },
    { code: "TESTE100", percentOff: "100", duration: "once", sandboxOnly: true },
  ],
  storefront: { slug: "minha-loja", name: "Minha loja", products: ["ecommerce/ebook"] },
});

const readFile = async (path: string) => ({
  bytes: new TextEncoder().encode(`pdf:${path}`),
  contentType: "application/pdf",
  fileName: "ebook.pdf",
  sha256: "abc123",
});

describe("assertValidManifest", () => {
  it("refuses a schemaVersion this CLI does not know, before anything is written", () => {
    expect(() => assertValidManifest({ ...ECOMMERCE, schemaVersion: 2 })).toThrow(SchemaVersionError);
    expect(() => assertValidManifest({ ...ECOMMERCE, schemaVersion: 2 })).toThrow(/Update the CLI/);
    expect(() => assertValidManifest({ ...ECOMMERCE, schemaVersion: undefined })).toThrow(SchemaVersionError);
  });

  it("requires every template product key to carry the template prefix", () => {
    const bad = { ...ECOMMERCE, products: [{ ...ECOMMERCE.products[0]!, key: "ebook" }] };
    expect(() => assertValidManifest(bad)).toThrow(/must start with "ecommerce\/"/);
  });

  it("refuses a store shelving a product the manifest does not declare", () => {
    const bad = { ...ECOMMERCE, storefront: { ...ECOMMERCE.storefront!, products: ["ecommerce/curso"] } };
    expect(() => assertValidManifest(bad)).toThrow(/storefront\.products/);
  });
});

describe("template sync", () => {
  it("seeds catalog, file, coupons and store on sandbox", async () => {
    const { infi, state, fetchImpl } = fakeInfi();
    const res = await syncBilling(infi, ECOMMERCE, { mode: "sandbox", readFile, fetchImpl, now: "t0" });
    expect(state.products[0]).toMatchObject({ key: "ecommerce/ebook", guaranteeDays: 7 });
    expect(state.uploads).toBe(1);
    expect(state.saves[0]).toMatchObject({ kind: "file", fileName: "ebook.pdf" });
    expect(state.coupons.map((c) => c.code)).toEqual(["LANCAMENTO", "TESTE100"]);
    expect(state.shelves[state.storefronts[0].id]).toEqual([{ productId: state.products[0].id, visible: true }]);
    expect(res.lock.products["ecommerce/ebook"]?.deliverableHash).toBe("abc123");
    expect(res.lock.storefront?.slug).toBe("minha-loja");
  });

  it("syncs the rest of the store when file storage is down, and retries the file next time", async () => {
    const { infi, state, fetchImpl } = fakeInfi();
    (infi.products.deliverable.presign as any).mockRejectedValueOnce(new InfiError("unavailable", 503, "storage_unavailable"));
    const res = await syncBilling(infi, ECOMMERCE, { mode: "sandbox", readFile, fetchImpl });
    expect(res.actions).toContainEqual(expect.objectContaining({ resource: "deliverable", action: "blocked" }));
    expect(state.storefronts).toHaveLength(1);
    expect(res.lock.products["ecommerce/ebook"]?.deliverableHash).toBeUndefined();
  });

  it("does not re-upload an unchanged file", async () => {
    const { infi, state, fetchImpl } = fakeInfi();
    const first = await syncBilling(infi, ECOMMERCE, { mode: "sandbox", readFile, fetchImpl, now: "t0" });
    await syncBilling(infi, ECOMMERCE, { mode: "sandbox", readFile, fetchImpl, lock: first.lock, now: "t1" });
    expect(state.uploads).toBe(1);
  });

  it("leaves sandboxOnly coupons out of live", async () => {
    const { infi, state, fetchImpl } = fakeInfi();
    const res = await syncBilling(infi, ECOMMERCE, { mode: "live", readFile, fetchImpl, now: "t0" });
    expect(state.coupons.map((c) => c.code)).toEqual(["LANCAMENTO"]);
    expect(res.actions).toContainEqual(expect.objectContaining({ resource: "coupon", ref: "TESTE100", action: "skip" }));
  });

  it("blocks a template key the tenant already sells, unless the person adopts or renames it", async () => {
    const theirs = { id: "prod_existing", key: "ecommerce/ebook", name: "Meu ebook", type: "item", pricingModel: "one_time", currency: "BRL" };
    const blocked = fakeInfi({ products: [{ ...theirs }] });
    const res = await syncBilling(blocked.infi, ECOMMERCE, { mode: "sandbox", readFile, fetchImpl: blocked.fetchImpl });
    expect(res.collisions).toEqual([
      expect.objectContaining({ key: "ecommerce/ebook", diff: { name: ["Meu ebook", "Ebook"] } }),
    ]);
    expect(blocked.state.products).toHaveLength(1);
    expect(blocked.state.products[0].name).toBe("Meu ebook");

    const renamed = fakeInfi({ products: [{ ...theirs }] });
    const res2 = await syncBilling(renamed.infi, ECOMMERCE, {
      mode: "sandbox",
      readFile,
      fetchImpl: renamed.fetchImpl,
      onCollision: async () => ({ action: "rename", key: "ecommerce/ebook-2" }),
    });
    expect(res2.renames).toEqual({ "ecommerce/ebook": "ecommerce/ebook-2" });
    expect(renamed.state.products.map((p) => p.key)).toEqual(["ecommerce/ebook", "ecommerce/ebook-2"]);

    const adopted = fakeInfi({ products: [{ ...theirs }] });
    await syncBilling(adopted.infi, ECOMMERCE, {
      mode: "sandbox",
      readFile,
      fetchImpl: adopted.fetchImpl,
      onCollision: async () => ({ action: "adopt" }),
    });
    expect(adopted.state.products).toHaveLength(1);
    expect(adopted.state.products[0].name).toBe("Ebook");
  });

  it("offers a taken store slug back as an editable suggestion", async () => {
    const { infi, state, fetchImpl } = fakeInfi({ takenSlugs: ["minha-loja"] });
    const noAnswer = await syncBilling(infi, ECOMMERCE, { mode: "sandbox", readFile, fetchImpl });
    expect(noAnswer.actions).toContainEqual(
      expect.objectContaining({ resource: "storefront", action: "blocked", detail: expect.stringMatching(/try "minha-loja-/) }),
    );
    const asked = vi.fn(async (_slug: string, suggestion: string) => `${suggestion}-ok`);
    const res = await syncBilling(infi, ECOMMERCE, { mode: "sandbox", readFile, fetchImpl, onSlugTaken: asked });
    expect(asked).toHaveBeenCalledWith("minha-loja", expect.stringMatching(/^minha-loja-[0-9a-z]{4}$/));
    expect(res.storefrontSlug).toMatch(/-ok$/);
    expect(state.storefronts).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("reads the mode from the key", () => {
    expect(modeOfKey("sk_live_x")).toBe("live");
    expect(modeOfKey("sk_test_x")).toBe("sandbox");
  });
  it("suggests a slug with a short suffix", () => {
    expect(suggestSlug("loja", () => 0.5)).toMatch(/^loja-[0-9a-z]{4}$/);
  });
});
