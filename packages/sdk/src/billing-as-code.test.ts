import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Infi } from "./client.js";
import { InfiError } from "./errors.js";
import { companyFromIntent } from "./company-intents.js";
import {
  apiError,
  fakeApply,
  fakePlan,
  startFakeConfigServer,
  type FakeConfigServer,
} from "./testing/fake-config-server.js";

let srv: FakeConfigServer;
let infi: Infi;
const config = companyFromIntent("prepaid-ai-chat");

beforeEach(async () => {
  srv = await startFakeConfigServer();
  infi = new Infi({ secretKey: "sk_test_x", apiUrl: srv.url });
});
afterEach(() => srv.close());

const applies = () => srv.requests.filter((r) => r.path === "/config/apply");

describe("syncBilling — a thin client over /config", () => {
  it("plans the serialized document and applies it with Idempotency-Key = planHash", async () => {
    srv.on("POST /config/plan", { status: 200, body: fakePlan({ planHash: "ph_42" }) });
    srv.on("POST /config/apply", {
      status: 200,
      body: fakeApply("applied", { secrets: [{ url: "https://x.test/h", secret: "whsec_once" }] }),
    });
    const seen: string[] = [];
    const r = await infi.sync(config, { locale: "pt-BR", onPlan: (p) => void seen.push(p.planHash) });

    expect(r.status).toBe("applied");
    expect(r.secrets).toEqual([{ url: "https://x.test/h", secret: "whsec_once" }]);
    expect(seen).toEqual(["ph_42"]);
    const [plan, apply] = srv.requests;
    expect(plan!.headers["accept-language"]).toBe("pt-BR");
    expect(plan!.body.document.schemaVersion).toBe(1);
    expect(plan!.body.options).toEqual({});
    expect(apply!.headers["idempotency-key"]).toBe("ph_42");
    expect(apply!.body).toEqual({ document: plan!.body.document, options: {}, planHash: "ph_42" });
  });

  it("sends the same options to plan and apply (they are part of the hash)", async () => {
    srv.on("POST /config/plan", { status: 200, body: fakePlan() });
    srv.on("POST /config/apply", { status: 200, body: fakeApply("applied") });
    await infi.sync(config, { adoptUnmanaged: true, overwriteDrift: true });
    const want = { adoptUnmanaged: true, overwriteDrift: true };
    expect(srv.requests[0]!.body.options).toEqual(want);
    expect(srv.requests[1]!.body.options).toEqual(want);
  });

  it("plan: true never applies", async () => {
    srv.on("POST /config/plan", { status: 200, body: fakePlan() });
    const r = await infi.sync(config, { plan: true });
    expect(r.status).toBe("planned");
    expect(applies()).toHaveLength(0);
  });

  it("an unchanged tenant is not applied", async () => {
    srv.on("POST /config/plan", {
      status: 200,
      body: fakePlan({ changes: [{ action: "skip", resource: "product", ref: "AI Chat", key: "ai-chat", sentence: "No change." }] }),
    });
    expect((await infi.sync(config)).status).toBe("unchanged");
    expect(applies()).toHaveLength(0);
  });

  it("202 on live is a proposal: returns the approval link and never repeats the call", async () => {
    srv.on("POST /config/plan", { status: 200, body: fakePlan({ mode: "live" }) });
    srv.on("POST /config/apply", { status: 202, body: fakeApply("planned") });
    const live = new Infi({ secretKey: "sk_live_x", apiUrl: srv.url });
    const r = await live.sync(config);
    expect(r.status).toBe("proposed");
    expect(r.approvalUrl).toBe("https://app.beinfi.com/config/revisions/crev_1");
    expect(r.secrets).toBeUndefined();
    expect(applies()).toHaveLength(1);
  });

  it("409 plan_stale plans again and hands back the fresh plan, without applying it", async () => {
    srv.on("POST /config/plan", [
      { status: 200, body: fakePlan({ planHash: "old" }) },
      { status: 200, body: fakePlan({ planHash: "new" }) },
    ]);
    srv.on("POST /config/apply", apiError(409, "plan_stale", { planHash: "new" }));
    const r = await infi.sync(config);
    expect(r.status).toBe("stale");
    expect(r.plan.planHash).toBe("new");
    expect(applies()).toHaveLength(1);
    expect(applies()[0]!.headers["idempotency-key"]).toBe("old");
  });

  it("a blocked plan is not applied, and each held change names what resolves it", async () => {
    srv.on("POST /config/plan", {
      status: 200,
      body: fakePlan({
        changes: [
          { action: "blocked", resource: "product", ref: "AI Chat", key: "ai-chat", reason: "unmanaged", sentence: "AI Chat exists but no revision wrote it." },
          { action: "blocked", resource: "version", ref: "AI Chat", key: "ai-chat", reason: "drift", sentence: "The price was edited in the dashboard." },
          { action: "blocked", resource: "product", ref: "Old", key: "old", reason: "active_subscriptions", sentence: "3 subscribers hold Old." },
        ],
      }),
    });
    const r = await infi.sync(config);
    expect(r.status).toBe("blocked");
    expect(applies()).toHaveLength(0);
    expect(r.held.map((h) => [h.reason, h.option])).toEqual([
      ["unmanaged", "adoptUnmanaged"],
      ["drift", "overwriteDrift"],
      ["active_subscriptions", undefined],
    ]);
    expect(r.held[2]!.resolution).toMatch(/No option overrides this/);
  });

  it("409 plan_blocked (a race) re-plans and reports the block", async () => {
    srv.on("POST /config/plan", [
      { status: 200, body: fakePlan() },
      { status: 200, body: fakePlan({ changes: [{ action: "blocked", resource: "webhook", ref: "https://x.test", key: "https://x.test", reason: "drift", sentence: "Edited." }] }) },
    ]);
    srv.on("POST /config/apply", apiError(409, "plan_blocked"));
    const r = await infi.sync(config);
    expect(r.status).toBe("blocked");
    expect(r.held[0]!.option).toBe("overwriteDrift");
  });

  it("refuses the removed force option before any request", async () => {
    await expect(infi.sync(config, { force: true } as never)).rejects.toMatchObject({ code: "sync_force_removed" });
    expect(srv.requests).toHaveLength(0);
  });

  it("surfaces a 422 from plan with its field errors", async () => {
    srv.on("POST /config/plan", {
      status: 422,
      body: { message: "The company document is invalid.", error_code: "validation_failed", tracer_id: "t", errors: [{ field: "products[0].basePrice", message: "is below the minimum charge" }] },
    });
    const err = await infi.sync(config).catch((e) => e);
    expect(err).toBeInstanceOf(InfiError);
    expect(err.message).toMatch(/products\[0\]\.basePrice: is below the minimum charge/);
  });
});

describe("config resource", () => {
  it("pull reads GET /config/document", async () => {
    srv.on("GET /config/document", { status: 200, body: { schemaVersion: 1, products: [] } });
    expect(await infi.config.document()).toEqual({ schemaVersion: 1, products: [] });
  });

  it("promote sends the receipt's document to live and returns the proposal", async () => {
    const receipt = { docHash: "abc", slug: "acme", sourceRevisionId: "crev_9", issuedAt: "2026-10-16T00:00:00Z", keyId: "k1", signature: "sig" };
    srv.on("POST /config/revisions/crev_9/promotion-receipt", { status: 200, body: { document: { schemaVersion: 1, products: [] }, receipt } });
    srv.on("POST /config/promote", { status: 202, body: { ...fakeApply("planned"), plan: fakePlan({ mode: "live" }) } });
    const pkg = await infi.config.promotionReceipt("crev_9");
    const res = await infi.config.promote(pkg);
    expect(res.approvalUrl).toContain("/config/revisions/");
    const promote = srv.requests.find((r) => r.path === "/config/promote")!;
    expect(promote.body).toEqual({ document: pkg.document, receipt, options: {} });
  });
});
