import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { defineBilling, syncBilling, syncIdempotencyKey } from "./billing-as-code.js";
import type { Infi } from "./client.js";
import { sha256Hex } from "./sha256.js";

/**
 * A backend fake that honours Idempotency-Key the way the API does: the first
 * request with a key runs and its response is stored; any later request with the
 * same key gets that stored response and changes nothing.
 *
 * `timeouts` makes the Nth call of an operation apply its side effect and THEN
 * throw an AbortError — the server did the work, the client never heard back.
 */
function idempotentBackend(opts: { mode?: "sandbox" | "live"; timeouts?: Record<string, number> } = {}) {
  const state = {
    products: [] as any[],
    meters: {} as Record<string, any[]>,
    versions: {} as Record<string, any[]>,
    prices: {} as Record<string, any[]>,
    webhooks: [] as any[],
  };
  const replies = new Map<string, unknown>();
  const keys: Array<{ op: string; key: string | undefined }> = [];
  const counts: Record<string, number> = {};
  let seq = 1;

  async function write<T>(op: string, key: string | undefined, run: () => T): Promise<T> {
    keys.push({ op, key });
    if (key && replies.has(key)) return replies.get(key) as T;
    const out = run();
    if (key) replies.set(key, out);
    counts[op] = (counts[op] ?? 0) + 1;
    if (opts.timeouts?.[op] === counts[op]) {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "AbortError";
      throw err;
    }
    return out;
  }

  const infi = {
    mode: opts.mode ?? "sandbox",
    account: { get: async () => ({ id: "acc_tenant1", slug: "acme" }) },
    products: {
      list: async () => state.products,
      create: (input: any, key?: string) =>
        write("product.create", key, () => {
          const prod = { id: `prd_${seq++}`, ...input };
          state.products.push(prod);
          state.meters[prod.id] = [];
          state.versions[prod.id] = [];
          return prod;
        }),
      update: (id: string, patch: any, key?: string) =>
        write("product.update", key, () => Object.assign(state.products.find((p) => p.id === id), patch)),
      meters: {
        list: async (id: string) => state.meters[id] ?? [],
        create: (id: string, input: any, key?: string) =>
          write("meter.create", key, () => {
            const m = { id: `mtr_${seq++}`, ...input };
            (state.meters[id] ??= []).push(m);
            return m;
          }),
        update: (id: string, meterId: string, patch: any, key?: string) =>
          write("meter.update", key, () => Object.assign(state.meters[id]!.find((m) => m.id === meterId), patch)),
      },
      versions: {
        list: async (id: string) => state.versions[id] ?? [],
        create: (id: string, input: any, key?: string) =>
          write("version.create", key, () => {
            const v = { id: `ver_${seq++}`, version: (state.versions[id]?.length ?? 0) + 1, status: "draft", ...input };
            (state.versions[id] ??= []).push(v);
            state.prices[v.id] = [];
            return v;
          }),
        publish: (_id: string, versionId: string, key?: string) =>
          write("version.publish", key, () => {
            for (const vs of Object.values(state.versions)) {
              for (const v of vs) if (v.status === "published") v.status = "archived";
            }
            for (const vs of Object.values(state.versions)) {
              const v = vs.find((x) => x.id === versionId);
              if (v) v.status = "published";
            }
            return {};
          }),
      },
      prices: {
        list: async (_id: string, versionId: string) => state.prices[versionId] ?? [],
        add: (_id: string, versionId: string, input: any, key?: string) =>
          write("price.add", key, () => {
            const price = { id: `prc_${seq++}`, ...input };
            (state.prices[versionId] ??= []).push(price);
            return price;
          }),
      },
      deliverable: { save: (_id: string, input: any, key?: string) => write("deliverable.save", key, () => input) },
    },
    webhooks: {
      list: async () => state.webhooks,
      create: (input: any, key?: string) =>
        write("webhook.create", key, () => {
          const wh = { id: `whe_${seq++}`, isActive: true, ...input };
          state.webhooks.push(wh);
          return wh;
        }),
      patch: (id: string, patch: any, key?: string) =>
        write("webhook.patch", key, () => Object.assign(state.webhooks.find((w) => w.id === id), patch)),
    },
  };
  return { infi: infi as unknown as Infi, state, keys, counts };
}

const TWO_PRICES = defineBilling({
  products: [
    {
      key: "ai-chat",
      name: "AI Chat",
      type: "agent",
      pricingModel: "usage",
      currency: "BRL",
      billingCycle: "monthly",
      meters: [
        { key: "tokens", unit: "token", aggregation: "sum" },
        { key: "requests", unit: "request", aggregation: "count" },
      ],
      prices: [
        { meter: "tokens", model: "per_unit", unitAmount: "0.002" },
        { meter: "requests", model: "per_unit", unitAmount: "0.01" },
      ],
    },
  ],
  webhooks: [{ url: "https://acme.test/hooks", events: ["payment.confirmed"] }],
});

function withPrice(amount: string) {
  return defineBilling({
    products: [{ ...TWO_PRICES.products[0]!, prices: [{ meter: "tokens", model: "per_unit", unitAmount: amount }] }],
  });
}

describe("sha256Hex", () => {
  it("matches node:crypto across block boundaries and multi-byte input", () => {
    for (const s of ["", "abc", "é".repeat(100), "x".repeat(55), "x".repeat(56), "x".repeat(64), "y".repeat(1000)]) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });
});

describe("drift without a lock", () => {
  // The hole: `drifted` needed a previous lock entry, so an apply with no lock
  // (the MCP never passed one) overwrote whatever the dashboard had set.
  it("blocks an apply that would overwrite existing resources the lock does not vouch for", async () => {
    const { infi, state, counts } = idempotentBackend();
    await syncBilling(infi, TWO_PRICES); // seed the tenant
    state.products[0].name = "Renamed in dashboard";
    state.meters[state.products[0].id]![0].displayName = "Tokens (dashboard)";
    state.webhooks[0].events = ["payment.confirmed", "payment.failed"];
    const before = { ...counts };

    const res = await syncBilling(infi, withPrice("0.003"));
    const blocked = res.actions.filter((a) => a.action === "blocked").map((a) => a.resource).sort();

    expect(blocked).toEqual(["meter", "product", "version"]);
    expect(res.actions.find((a) => a.action === "blocked")?.detail).toBe("exists in the tenant but not in the lock");
    expect(res.drift.length).toBeGreaterThan(0);
    expect(counts).toEqual(before); // nothing written
    expect(res.lock.products["ai-chat"]).toBeUndefined(); // stays flagged

    const webhookOnly = await syncBilling(infi, { products: [], webhooks: TWO_PRICES.webhooks });
    expect(webhookOnly.actions[0]).toMatchObject({ action: "blocked", resource: "webhook" });
  });

  it("blocks just the same when a lock exists but has no entry for the resource", async () => {
    const { infi, state } = idempotentBackend();
    await syncBilling(infi, TWO_PRICES);
    state.products[0].name = "Renamed";

    const res = await syncBilling(infi, TWO_PRICES, { lock: { version: 1, products: {} } });
    expect(res.actions.find((a) => a.resource === "product")?.action).toBe("blocked");
  });

  it("applies with an explicit force", async () => {
    const { infi, state } = idempotentBackend();
    await syncBilling(infi, TWO_PRICES);
    state.products[0].name = "Renamed";

    const res = await syncBilling(infi, withPrice("0.003"), { force: true });
    expect(res.drift).toEqual([]);
    expect(res.actions.find((a) => a.resource === "version")?.action).toBe("bump");
    expect(state.products[0].name).toBe("AI Chat");
  });

  it("adopts an existing resource that already matches the file", async () => {
    const { infi } = idempotentBackend();
    await syncBilling(infi, TWO_PRICES);

    const res = await syncBilling(infi, TWO_PRICES);
    expect(res.drift).toEqual([]);
    expect(res.lock.products["ai-chat"]?.state).toBeTruthy();
    expect(res.lock.webhooks?.["https://acme.test/hooks"]?.state).toBeTruthy();
  });
});

describe("Idempotency-Key on sync writes", () => {
  it("sends a deterministic key on every write", async () => {
    const a = idempotentBackend();
    const b = idempotentBackend();
    await syncBilling(a.infi, { ...TWO_PRICES, products: [{ ...TWO_PRICES.products[0]!, deliverable: { kind: "link", url: "https://x.test" } }] });
    await syncBilling(b.infi, { ...TWO_PRICES, products: [{ ...TWO_PRICES.products[0]!, deliverable: { kind: "link", url: "https://x.test" } }] });

    expect(a.keys.length).toBeGreaterThan(0);
    for (const k of a.keys) expect(k.key, k.op).toMatch(/^sync_[0-9a-f]{48}$/);
    // Same tenant, same file, same starting state: byte-identical keys.
    expect(a.keys).toEqual(b.keys);
    expect(new Set(a.keys.map((k) => k.key)).size).toBe(a.keys.length);
  });

  it("scopes the key by tenant", () => {
    expect(syncIdempotencyKey("acc_1", "product.create", { key: "x" })).not.toBe(
      syncIdempotencyKey("acc_2", "product.create", { key: "x" }),
    );
  });

  // Keyed on the payload alone, going back to a previous price would replay the
  // first version's create and publish nothing.
  it("a revert (A → B → A) creates a fresh version instead of replaying the first", async () => {
    const { infi, state } = idempotentBackend();
    const r1 = await syncBilling(infi, withPrice("0.002"));
    const r2 = await syncBilling(infi, withPrice("0.003"), { lock: r1.lock });
    await syncBilling(infi, withPrice("0.002"), { lock: r2.lock });

    const versions = state.versions[state.products[0].id]!;
    expect(versions).toHaveLength(3);
    const published = versions.find((v) => v.status === "published")!;
    expect(published.id).toBe(versions[2].id);
    expect(state.prices[published.id]![0].unitAmount).toBe("0.002");
  });
});

describe("retry after a timeout", () => {
  function single(state: ReturnType<typeof idempotentBackend>["state"]) {
    const productId = state.products[0].id;
    const versions = state.versions[productId]!;
    return { versions, prices: versions.flatMap((v) => state.prices[v.id] ?? []) };
  }

  it("version create timed out: the re-run reuses that draft, no second version", async () => {
    const { infi, state } = idempotentBackend({ timeouts: { "version.create": 1 } });
    await expect(syncBilling(infi, TWO_PRICES)).rejects.toThrow(/aborted/);

    const res = await syncBilling(infi, TWO_PRICES);

    const { versions, prices } = single(state);
    expect(versions).toHaveLength(1);
    expect(versions[0].status).toBe("published");
    expect(prices).toHaveLength(2);
    expect(res.drift).toEqual([]);
  });

  it("timed out mid-way through the prices: the re-run adds only the missing one", async () => {
    const { infi, state } = idempotentBackend({ timeouts: { "price.add": 1 } });
    await expect(syncBilling(infi, TWO_PRICES)).rejects.toThrow(/aborted/);
    expect(single(state).prices).toHaveLength(1);

    await syncBilling(infi, TWO_PRICES);

    const { versions, prices } = single(state);
    expect(versions).toHaveLength(1);
    expect(prices.map((p) => p.meterId).sort()).toEqual(
      state.meters[state.products[0].id]!.map((m) => m.id).sort(),
    );
  });

  it("a bump that timed out on publish does not duplicate on the re-run", async () => {
    const { infi, state } = idempotentBackend({ timeouts: { "version.publish": 2 } });
    const first = await syncBilling(infi, withPrice("0.002"));
    await expect(syncBilling(infi, withPrice("0.003"), { lock: first.lock })).rejects.toThrow(/aborted/);

    // The publish landed server-side; the re-run sees it and has nothing to do.
    const res = await syncBilling(infi, withPrice("0.003"), { lock: first.lock, force: true });
    expect(res.actions.find((a) => a.resource === "version")?.action).toBe("skip");
    expect(single(state).versions).toHaveLength(2);
  });
});

describe("lock mode", () => {
  it("stamps the client's mode into the lock", async () => {
    const live = idempotentBackend({ mode: "live" });
    expect((await syncBilling(live.infi, TWO_PRICES)).lock.mode).toBe("live");
    const sandbox = idempotentBackend();
    expect((await syncBilling(sandbox.infi, TWO_PRICES)).lock.mode).toBe("sandbox");
  });
});
