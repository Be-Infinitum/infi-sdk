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
    meterUpdate: 0,
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
        update: vi.fn(async (id: string, meterId: string, patch: any) => {
          calls.meterUpdate++;
          const m = (state.meters[id] ?? []).find((x) => x.id === meterId);
          Object.assign(m, patch);
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

  // The deployed API answers 422 "unrecognized field" for creditsPerCycle
  // (migration 000098 dropped the column), which failed every sync — and with it
  // `infi bootstrap`.
  it("sends the cycle allowance as grants[], never as creditsPerCycle", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "ai-chat",
            name: "AI Chat",
            type: "agent",
            pricingModel: "prepaid",
            currency: "BRL",
            billingCycle: "monthly",
            grants: [{ meter: "credits", amount: "100", on: "cycle" }],
          },
        ],
      }),
    );

    const body = (infi.products.versions.create as any).mock.calls[0][1];
    expect(body).not.toHaveProperty("creditsPerCycle");
    expect(body.grants).toEqual([{ meter: "credits", amount: "100", on: "cycle" }]);
  });

  it("maps the deprecated creditsPerCycle onto a credits grant", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "ai-chat",
            type: "agent",
            pricingModel: "prepaid",
            currency: "BRL",
            billingCycle: "monthly",
            creditsPerCycle: "50",
          },
        ],
      }),
    );

    const body = (infi.products.versions.create as any).mock.calls[0][1];
    expect(body).not.toHaveProperty("creditsPerCycle");
    expect(body.grants).toEqual([{ meter: "credits", amount: "50", on: "cycle" }]);
  });

  // The backend has shipped on_event=payment grants since ADR 0021
  // (product_version_grants + internal/metergrant credits the wallet on
  // payment.confirmed). Sync refusing to send them forced every prepaid
  // top-up integration to hand-roll a webhook, a product lookup and its own
  // idempotency for something the platform already does.
  it("sends grants on payment, not just on cycle", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "topup",
            type: "item",
            pricingModel: "one_time",
            currency: "BRL",
            basePrice: "19.90",
            grants: [{ meter: "tokens", amount: "500000", on: "payment" }],
          },
        ],
      }),
    );

    const body = (infi.products.versions.create as any).mock.calls[0][1];
    expect(body.grants).toEqual([{ meter: "tokens", amount: "500000", on: "payment" }]);
  });

  it("sends cycle and payment grants together", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "hybrid",
            type: "agent",
            pricingModel: "prepaid",
            currency: "BRL",
            billingCycle: "monthly",
            grants: [
              { meter: "tokens", amount: "50000", on: "cycle" },
              { meter: "tokens", amount: "500000", on: "payment" },
            ],
          },
        ],
      }),
    );

    const body = (infi.products.versions.create as any).mock.calls[0][1];
    expect(body.grants).toEqual([
      { meter: "tokens", amount: "50000", on: "cycle" },
      { meter: "tokens", amount: "500000", on: "payment" },
    ]);
  });

  it("reports a payment grant as applied, not as skipped", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    const r = await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "topup",
            type: "item",
            pricingModel: "one_time",
            currency: "BRL",
            basePrice: "19.90",
            grants: [{ meter: "tokens", amount: "500000", on: "payment" }],
          },
        ],
      }),
    );

    const grant = r.actions.find((a) => a.resource === "grant");
    expect(grant?.detail).toContain("500000");
    expect(grant?.detail).not.toContain("not supported");
  });

  // The backend answers 422 "meterId is required: prices are meter rates; flat
  // amounts live on the version's base price" — but only at publish, which
  // `--plan` never reaches. A green plan then broke mid-apply with the products
  // already created. Catch it before anything is written.
  it("rejects a price without a meter at plan time, before writing anything", async () => {
    const { infi, calls } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    const config = defineBilling({
      products: [
        {
          key: "topup",
          type: "item",
          pricingModel: "one_time",
          currency: "BRL",
          // Cast deliberado: o tipo agora impede isto em TS, e a guarda de
          // runtime existe para quem chama de JS puro ou ignora o tipo.
          prices: [{ model: "flat", unitAmount: "19.90" } as never],
        },
      ],
    });

    await expect(syncBilling(infi, config, { plan: true })).rejects.toThrow(/basePrice/);
    expect(calls.create).toBe(0);
    expect(calls.versionCreate).toBe(0);
  });

  it("names the offending product and price in the message", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    const config = defineBilling({
      products: [
        {
          key: "topup",
          type: "item",
          pricingModel: "one_time",
          currency: "BRL",
          // Cast deliberado: o tipo agora impede isto em TS, e a guarda de
          // runtime existe para quem chama de JS puro ou ignora o tipo.
          prices: [{ model: "flat", unitAmount: "19.90" } as never],
        },
      ],
    });

    await expect(syncBilling(infi, config)).rejects.toThrow(/topup/);
  });

  it("accepts a flat amount expressed as basePrice", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "topup",
            type: "item",
            pricingModel: "one_time",
            currency: "BRL",
            basePrice: "19.90",
          },
        ],
      }),
    );

    const body = (infi.products.versions.create as any).mock.calls[0][1];
    expect(body.basePrice).toBe("19.90");
  });

  // A webhook declared with an event the backend never emits registers an
  // endpoint that can never fire — and you debug your handler instead of the
  // event name. Fail on the name.
  it("rejects a webhook event the backend does not emit", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {}, webhooks: [] });
    const config = defineBilling({
      products: [],
      webhooks: [{ url: "https://example.com/hook", events: ["invoice.payed"] }],
    });

    await expect(syncBilling(infi, config, { plan: true })).rejects.toThrow(/invoice\.payed/);
  });

  it("accepts every event the backend emits", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {}, webhooks: [] });
    await expect(
      syncBilling(
        infi,
        defineBilling({
          products: [],
          webhooks: [{ url: "https://example.com/hook", events: ["invoice.paid", "payment.refunded"] }],
        }),
        { plan: true },
      ),
    ).resolves.toBeDefined();
  });

  // Drift only ever compared the CYCLE grant, so adding on:"payment" to a
  // product that already exists reported skip and applied nothing — the grant
  // silently never reached the tenant.
  it("bumps the version when a payment grant is added to an existing product", async () => {
    const state: any = {
      products: [{ id: "prod_1", key: "topup", name: "topup", type: "item", pricingModel: "one_time", currency: "BRL" }],
      meters: { prod_1: [] },
      versions: {
        prod_1: [
          { id: "ver_1", status: "published", billingCycle: null, basePrice: "19.90", grants: [] },
        ],
      },
      prices: { ver_1: [] },
    };
    const { infi, calls } = fakeInfi(state);

    const r = await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "topup",
            type: "item",
            pricingModel: "one_time",
            currency: "BRL",
            basePrice: "19.90",
            grants: [{ meter: "tokens", amount: "500000", on: "payment" }],
          },
        ],
      }),
    );

    const version = r.actions.find((a) => a.resource === "version");
    expect(version?.action).toBe("bump");
    expect(calls.versionCreate).toBe(1);
    const body = (infi.products.versions.create as any).mock.calls[0][1];
    expect(body.grants).toEqual([{ meter: "tokens", amount: "500000", on: "payment" }]);
  });

  it("does not bump when the payment grant already matches", async () => {
    const state: any = {
      products: [{ id: "prod_1", key: "topup", name: "topup", type: "item", pricingModel: "one_time", currency: "BRL" }],
      meters: { prod_1: [] },
      versions: {
        prod_1: [
          {
            id: "ver_1",
            status: "published",
            billingCycle: null,
            basePrice: "19.90",
            grants: [{ meter: "tokens", amount: "500000", on: "payment" }],
          },
        ],
      },
      prices: { ver_1: [] },
    };
    const { infi, calls } = fakeInfi(state);

    const r = await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "topup",
            type: "item",
            pricingModel: "one_time",
            currency: "BRL",
            basePrice: "19.90",
            grants: [{ meter: "tokens", amount: "500000", on: "payment" }],
          },
        ],
      }),
    );

    expect(r.actions.find((a) => a.resource === "version")?.action).toBe("skip");
    expect(calls.versionCreate).toBe(0);
  });

  it("omits grants entirely when the product has none", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(infi, CONFIG);

    const body = (infi.products.versions.create as any).mock.calls[0][1];
    expect(body).not.toHaveProperty("grants");
    expect(body).not.toHaveProperty("creditsPerCycle");
  });

  // `sum` without a valueProperty is a 422 ("is required unless aggregation is
  // count"), which failed three of the four bootstrap intents.
  it("defaults valueProperty for a non-count meter, and omits it for count", async () => {
    const { infi } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(
      infi,
      defineBilling({
        products: [
          {
            key: "crm",
            type: "agent",
            pricingModel: "usage",
            currency: "BRL",
            meters: [
              { key: "leads", unit: "unit", aggregation: "sum" },
              { key: "hits", unit: "request", aggregation: "count" },
            ],
          },
        ],
      }),
    );

    const bodies = (infi.products.meters.create as any).mock.calls.map((c: any[]) => c[1]);
    expect(bodies[0].valueProperty).toBe("value");
    expect(bodies[1]).not.toHaveProperty("valueProperty");
  });

  // The API echoes `tiers: []` on a flat price, the config omits the field, and
  // `[]` is truthy — so a freshly synced tenant reported price drift and published
  // a new version on every run.
  it("is idempotent when the API echoes an empty tiers array", async () => {
    const state: FakeState = {
      products: [{ id: "prod_1", key: "ai-chat", name: "AI Chat", type: "agent", pricingModel: "prepaid", currency: "BRL" }],
      meters: { prod_1: [{ id: "m_1", name: "tokens", displayName: "tokens" }] },
      versions: { prod_1: [{ id: "v_1", version: 1, status: "published", billingCycle: "monthly", basePrice: null }] },
      prices: { v_1: [{ id: "pr_1", meterId: "m_1", model: "per_unit", unitAmount: "0.00200000", currency: "BRL", tiers: [] }] },
    };
    const { infi, calls } = fakeInfi(state);

    const res = await syncBilling(infi, CONFIG);

    expect(res.actions.find((a) => a.resource === "version")?.action).toBe("skip");
    expect(calls.versionCreate).toBe(0);
  });

  it("skips when the published version already matches", async () => {
    const state: FakeState = {
      products: [{ id: "prod_1", key: "ai-chat", name: "AI Chat", type: "agent", pricingModel: "prepaid", currency: "BRL" }],
      meters: { prod_1: [{ id: "m_1", name: "tokens", displayName: "tokens" }] },
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
      meters: { prod_1: [{ id: "m_1", name: "tokens", displayName: "tokens" }] },
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
      meters: { prod_1: [{ id: "m_1", name: "tokens", displayName: "tokens" }] },
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

  it("updates a meter when its display name drifts", async () => {
    const state: FakeState = {
      products: [{ id: "prod_1", key: "ai-chat", name: "AI Chat", type: "agent", pricingModel: "prepaid", currency: "BRL" }],
      meters: { prod_1: [{ id: "m_1", name: "tokens", displayName: "Old Label", unit: "token", aggregation: "sum" }] },
      versions: { prod_1: [{ id: "v_1", version: 1, status: "published", billingCycle: "monthly", basePrice: null, creditsPerCycle: null }] },
      prices: { v_1: [{ id: "pr_1", meterId: "m_1", model: "per_unit", unitAmount: "0.002", currency: "BRL" }] },
    };
    const { infi, calls } = fakeInfi(state);
    const res = await syncBilling(infi, {
      products: [
        {
          key: "ai-chat", name: "AI Chat", type: "agent", pricingModel: "prepaid", currency: "BRL", billingCycle: "monthly",
          meters: [{ key: "tokens", displayName: "Tokens", unit: "token", aggregation: "sum" }],
          prices: [{ meter: "tokens", model: "per_unit", unitAmount: "0.002" }],
        },
      ],
    });

    const meter = res.actions.find((a) => a.resource === "meter");
    expect(meter?.action).toBe("update");
    expect(meter?.detail).toContain("displayName");
    expect(calls.meterUpdate).toBe(1);
    expect(calls.meterCreate).toBe(0);
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
      meters: { prod_1: [{ id: "m_1", name: "tokens", displayName: "tokens" }] },
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
  webhooks: [{ url: "https://app.example.com/hooks", events: ["payment.confirmed"] }],
});

describe("syncBilling webhooks", () => {
  it("creates a missing webhook", async () => {
    const { infi, calls } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    const res = await syncBilling(infi, PLATFORM);

    expect(res.actions.find((a) => a.resource === "webhook")?.action).toBe("create");
    expect(calls.webhookCreate).toBe(1);
  });

  it("plan mode writes no webhooks", async () => {
    const { infi, calls } = fakeInfi({ products: [], meters: {}, versions: {}, prices: {} });
    await syncBilling(infi, PLATFORM, { plan: true });

    expect(calls.webhookCreate).toBe(0);
  });

});
