import { describe, expect, it, vi } from "vitest";
import { defineBilling, syncBilling } from "./billing-as-code.js";
import type { Infi } from "./client.js";

type FakeState = {
  products: any[];
  meters: Record<string, any[]>;
  versions: Record<string, any[]>;
  prices: Record<string, any[]>;
  apps?: any[];
  webhooks?: any[];
};

/** Minimal in-memory Infi.products fake — syncBilling only touches this surface. */
function fakeInfi(state: FakeState) {
  const calls = {
    create: 0,
    update: 0,
    versionCreate: 0,
    publish: 0,
    priceAdd: 0,
    meterCreate: 0,
    appCreate: 0,
    appUpdate: 0,
    webhookCreate: 0,
    webhookPatch: 0,
  };
  let seq = 1;
  const infi = {
    products: {
      list: vi.fn(async () => state.products),
      create: vi.fn(async (input: any) => {
        calls.create++;
        const prod = { id: `prod_${seq++}`, ...input };
        state.products.push(prod);
        state.meters[prod.id] = [];
        state.versions[prod.id] = [];
        return prod;
      }),
      update: vi.fn(async (id: string, patch: any) => {
        calls.update++;
        const prod = state.products.find((p) => p.id === id);
        Object.assign(prod, patch);
        return prod;
      }),
      meters: {
        list: vi.fn(async (id: string) => state.meters[id] ?? []),
        create: vi.fn(async (id: string, input: any) => {
          calls.meterCreate++;
          const m = { id: `m_${seq++}`, name: input.name };
          (state.meters[id] ??= []).push(m);
          return m;
        }),
      },
      versions: {
        list: vi.fn(async (id: string) => state.versions[id] ?? []),
        create: vi.fn(async (id: string, input: any) => {
          calls.versionCreate++;
          const v = { id: `v_${seq++}`, version: (state.versions[id]?.length ?? 0) + 1, status: "draft", ...input };
          (state.versions[id] ??= []).push(v);
          state.prices[v.id] = [];
          return v;
        }),
        publish: vi.fn(async (_id: string, versionId: string) => {
          calls.publish++;
          for (const vs of Object.values(state.versions)) {
            const v = vs.find((x) => x.id === versionId);
            if (v) v.status = "published";
          }
          return {};
        }),
      },
      prices: {
        list: vi.fn(async (_id: string, versionId: string) => state.prices[versionId] ?? []),
        add: vi.fn(async (_id: string, versionId: string, input: any) => {
          calls.priceAdd++;
          const price = { id: `pr_${seq++}`, ...input };
          (state.prices[versionId] ??= []).push(price);
          return price;
        }),
      },
      deliverable: { save: vi.fn(async () => ({})) },
    },
    apps: {
      list: vi.fn(async () => state.apps ?? []),
      create: vi.fn(async (input: any) => {
        calls.appCreate++;
        const app = { id: `app_${seq++}`, ...input };
        (state.apps ??= []).push(app);
        return app;
      }),
      update: vi.fn(async (id: string, patch: any) => {
        calls.appUpdate++;
        const app = (state.apps ?? []).find((a) => a.id === id);
        Object.assign(app, patch);
        return app;
      }),
    },
    webhooks: {
      list: vi.fn(async () => state.webhooks ?? []),
      create: vi.fn(async (input: any) => {
        calls.webhookCreate++;
        const wh = { id: `wh_${seq++}`, isActive: true, ...input };
        (state.webhooks ??= []).push(wh);
        return wh;
      }),
      patch: vi.fn(async (id: string, patch: any) => {
        calls.webhookPatch++;
        const wh = (state.webhooks ?? []).find((w) => w.id === id);
        Object.assign(wh, patch);
        return wh;
      }),
    },
  };
  return { infi: infi as unknown as Infi, calls };
}

const CONFIG = defineBilling({
  products: [
    {
      key: "ai-chat",
      name: "AI Chat",
      type: "agent",
      pricingModel: "prepaid",
      currency: "BRL",
      billingCycle: "monthly",
      meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
      prices: [{ meter: "tokens", model: "per_unit", unitAmount: "0.002" }],
    },
  ],
});

describe("syncBilling", () => {
  it("creates a missing product with a seeded published version", async () => {
    const { infi, calls } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    const res = await syncBilling(infi, CONFIG);

    expect(res.actions.find((a) => a.resource === "product")?.action).toBe("create");
    expect(res.actions.find((a) => a.resource === "version")?.action).toBe("create");
    expect(calls.create).toBe(1);
    expect(calls.versionCreate).toBe(1);
    expect(calls.publish).toBe(1);
    expect(calls.priceAdd).toBe(1);
  });

  it("skips when the published version already matches", async () => {
    const state: FakeState = {
      products: [{ id: "prod_1", key: "ai-chat", name: "AI Chat", type: "agent", pricingModel: "prepaid", currency: "BRL" }],
      meters: { prod_1: [{ id: "m_1", name: "tokens" }] },
      versions: { prod_1: [{ id: "v_1", version: 1, status: "published", billingCycle: "monthly", basePrice: null, creditsPerCycle: null }] },
      prices: { v_1: [{ id: "pr_1", meterId: "m_1", model: "per_unit", unitAmount: "0.0020", currency: "BRL" }] },
    };
    const { infi, calls } = fakeInfi(state);
    const res = await syncBilling(infi, CONFIG);

    expect(res.actions.find((a) => a.resource === "product")?.action).toBe("skip");
    expect(res.actions.find((a) => a.resource === "version")?.action).toBe("skip");
    expect(calls.versionCreate).toBe(0);
    expect(calls.publish).toBe(0);
  });

  it("bumps the version when a price changes", async () => {
    const state: FakeState = {
      products: [{ id: "prod_1", key: "ai-chat", name: "AI Chat", type: "agent", pricingModel: "prepaid", currency: "BRL" }],
      meters: { prod_1: [{ id: "m_1", name: "tokens" }] },
      versions: { prod_1: [{ id: "v_1", version: 1, status: "published", billingCycle: "monthly", basePrice: null, creditsPerCycle: null }] },
      prices: { v_1: [{ id: "pr_1", meterId: "m_1", model: "per_unit", unitAmount: "0.001", currency: "BRL" }] },
    };
    const { infi, calls } = fakeInfi(state);
    const res = await syncBilling(infi, CONFIG);

    const bump = res.actions.find((a) => a.resource === "version");
    expect(bump?.action).toBe("bump");
    expect(bump?.detail).toContain("prices");
    expect(calls.versionCreate).toBe(1);
    expect(calls.publish).toBe(1);
    expect(state.versions.prod_1).toHaveLength(2); // old version kept
  });

  it("updates product metadata when the name drifts", async () => {
    const state: FakeState = {
      products: [{ id: "prod_1", key: "ai-chat", name: "Old Name", type: "agent", pricingModel: "prepaid", currency: "BRL" }],
      meters: { prod_1: [{ id: "m_1", name: "tokens" }] },
      versions: { prod_1: [{ id: "v_1", version: 1, status: "published", billingCycle: "monthly", basePrice: null, creditsPerCycle: null }] },
      prices: { v_1: [{ id: "pr_1", meterId: "m_1", model: "per_unit", unitAmount: "0.002", currency: "BRL" }] },
    };
    const { infi, calls } = fakeInfi(state);
    const res = await syncBilling(infi, CONFIG);

    const update = res.actions.find((a) => a.resource === "product");
    expect(update?.action).toBe("update");
    expect(update?.detail).toContain("name");
    expect(calls.update).toBe(1);
  });

  it("plan mode writes nothing", async () => {
    const { infi, calls } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    const res = await syncBilling(infi, CONFIG, { plan: true });

    expect(res.planned).toBe(true);
    expect(calls.create).toBe(0);
    expect(calls.versionCreate).toBe(0);
    expect(calls.publish).toBe(0);
  });

  function matchedState(): FakeState {
    return {
      products: [{ id: "prod_1", key: "ai-chat", name: "AI Chat", type: "agent", pricingModel: "prepaid", currency: "BRL" }],
      meters: { prod_1: [{ id: "m_1", name: "tokens" }] },
      versions: { prod_1: [{ id: "v_1", version: 1, status: "published", billingCycle: "monthly", basePrice: null, creditsPerCycle: null }] },
      prices: { v_1: [{ id: "pr_1", meterId: "m_1", model: "per_unit", unitAmount: "0.002", currency: "BRL" }] },
    };
  }

  it("blocks a bump when the backend drifted from the lock", async () => {
    const state = matchedState();
    const { infi, calls } = fakeInfi(state);

    const first = await syncBilling(infi, CONFIG, { now: "t1" });
    expect(first.lock.products["ai-chat"]!.state).toBeTruthy();

    // Dashboard edit: price changed outside the config.
    state.prices.v_1![0]!.unitAmount = "0.005";

    const second = await syncBilling(infi, CONFIG, { lock: first.lock, now: "t2" });
    expect(second.actions.find((a) => a.resource === "version")?.action).toBe("blocked");
    expect(second.drift).toHaveLength(1);
    expect(calls.versionCreate).toBe(0); // nothing written
    // Blocked product keeps its previous lock entry (stays flagged).
    expect(second.lock.products["ai-chat"]!.state).toBe(first.lock.products["ai-chat"]!.state);
  });

  it("--force overrides drift and bumps", async () => {
    const state = matchedState();
    const { infi, calls } = fakeInfi(state);

    const first = await syncBilling(infi, CONFIG, { now: "t1" });
    state.prices.v_1![0]!.unitAmount = "0.005";

    const forced = await syncBilling(infi, CONFIG, { lock: first.lock, force: true, now: "t2" });
    expect(forced.actions.find((a) => a.resource === "version")?.action).toBe("bump");
    expect(forced.drift).toHaveLength(0);
    expect(calls.versionCreate).toBe(1);
  });

  it("no drift when config and backend both match the lock (skip, lock refreshed)", async () => {
    const state = matchedState();
    const { infi } = fakeInfi(state);
    const first = await syncBilling(infi, CONFIG, { now: "t1" });
    const second = await syncBilling(infi, CONFIG, { lock: first.lock, now: "t2" });

    expect(second.drift).toHaveLength(0);
    expect(second.actions.find((a) => a.resource === "version")?.action).toBe("skip");
    expect(second.lock.products["ai-chat"]!.syncedAt).toBe("t2");
  });
});

const PLATFORM = defineBilling({
  products: [],
  apps: [
    { slug: "crm", name: "CRM", allowedOrigins: ["http://localhost:3010"], redirectUris: ["http://localhost:3010/cb"] },
  ],
  webhooks: [{ url: "https://app.example.com/hooks", events: ["payment.confirmed"] }],
});

describe("syncBilling apps + webhooks", () => {
  it("creates missing app and webhook", async () => {
    const { infi, calls } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    const res = await syncBilling(infi, PLATFORM);

    expect(res.actions.find((a) => a.resource === "app")?.action).toBe("create");
    expect(res.actions.find((a) => a.resource === "webhook")?.action).toBe("create");
    expect(calls.appCreate).toBe(1);
    expect(calls.webhookCreate).toBe(1);
  });

  it("updates app when origins change, skips unchanged webhook", async () => {
    const state: FakeState = {
      products: [],
      meters: {},
      versions: {},
      prices: {},
      apps: [{ id: "app_1", slug: "crm", name: "CRM", allowedOrigins: ["http://old"], redirectUris: ["http://localhost:3010/cb"] }],
      webhooks: [{ id: "wh_1", url: "https://app.example.com/hooks", events: ["payment.confirmed"], isActive: true }],
    };
    const { infi, calls } = fakeInfi(state);
    const res = await syncBilling(infi, PLATFORM);

    const app = res.actions.find((a) => a.resource === "app");
    expect(app?.action).toBe("update");
    expect(app?.detail).toContain("allowedOrigins");
    expect(res.actions.find((a) => a.resource === "webhook")?.action).toBe("skip");
    expect(calls.appUpdate).toBe(1);
    expect(calls.webhookPatch).toBe(0);
  });

  it("plan mode writes no apps/webhooks", async () => {
    const { infi, calls } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(infi, PLATFORM, { plan: true });

    expect(calls.appCreate).toBe(0);
    expect(calls.webhookCreate).toBe(0);
  });
});
