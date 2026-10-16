import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiError,
  fakeApply,
  fakePlan,
  startFakeConfigServer,
  type FakeConfigServer,
} from "../../../sdk/src/testing/fake-config-server.js";
import { syncCommand } from "./sync.js";
import { pullCommand } from "./pull.js";
import { promoteCommand } from "./promote.js";

let srv: FakeConfigServer;
let dir: string;
let out: string[];
const file = () => path.join(dir, "infi.company.ts");

beforeEach(async () => {
  srv = await startFakeConfigServer();
  process.env.INFI_API_URL = srv.url;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "infi-sync-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
  fs.writeFileSync(
    file(),
    `export default { products: [{ key: "ebook", type: "item", pricingModel: "one_time", basePrice: "19.90" }],
      webhooks: [{ url: "https://shop.test/hooks", events: ["payment.confirmed"] }] };\n`,
  );
  out = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
  vi.spyOn(process.stderr, "write").mockImplementation((s) => (out.push(String(s)), true));
  process.exitCode = undefined;
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.INFI_API_URL;
  process.exitCode = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
  await srv.close();
});

const text = () => out.join("\n");
const applies = () => srv.requests.filter((r) => r.path === "/config/apply");

describe("infi sync", () => {
  it("prints the plan's sentences, applies with the planHash, and shows new webhook secrets once", async () => {
    srv.on("POST /config/plan", { status: 200, body: fakePlan({ planHash: "ph_1" }) });
    srv.on("POST /config/apply", {
      status: 200,
      body: fakeApply("applied", { secrets: [{ url: "https://shop.test/hooks", secret: "whsec_once" }] }),
    });

    await syncCommand({ key: "sk_test_x", file: file() });

    expect(text()).toContain("Create the product AI Chat.");
    expect(text()).toContain("whsec_once");
    expect(applies()[0]!.headers["idempotency-key"]).toBe("ph_1");
    expect(process.exitCode).toBe(0);
    // The secret never lands on disk.
    for (const f of fs.readdirSync(dir)) expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toContain("whsec_once");
  });

  it("on live prints the approval link and calls apply once", async () => {
    srv.on("POST /config/plan", { status: 200, body: fakePlan({ mode: "live" }) });
    srv.on("POST /config/apply", { status: 202, body: fakeApply("planned") });

    await syncCommand({ key: "sk_live_x", file: file() });

    expect(text()).toContain("https://app.beinfi.com/config/revisions/crev_1");
    expect(applies()).toHaveLength(1);
    expect(process.exitCode).toBe(0);
  });

  it("on plan_stale shows the fresh plan, applies nothing more, and exits 3", async () => {
    srv.on("POST /config/plan", [
      { status: 200, body: fakePlan({ planHash: "old" }) },
      {
        status: 200,
        body: fakePlan({ planHash: "new", changes: [{ action: "bump", resource: "version", ref: "ebook", key: "ebook", sentence: "ebook goes to v2 at 24.90." }] }),
      },
    ]);
    srv.on("POST /config/apply", apiError(409, "plan_stale", { planHash: "new" }));

    await syncCommand({ key: "sk_test_x", file: file() });

    expect(text()).toContain("ebook goes to v2 at 24.90.");
    expect(applies()).toHaveLength(1);
    expect(process.exitCode).toBe(3);
  });

  it("on a blocked plan names the flag that resolves each change and exits 2", async () => {
    srv.on("POST /config/plan", {
      status: 200,
      body: fakePlan({
        changes: [{ action: "blocked", resource: "product", ref: "ebook", key: "ebook", reason: "unmanaged", sentence: "ebook exists but no revision wrote it." }],
      }),
    });

    await syncCommand({ key: "sk_test_x", file: file() });

    expect(text()).toContain("--adopt-unmanaged");
    expect(applies()).toHaveLength(0);
    expect(process.exitCode).toBe(2);
  });

  it("passes the three options through to plan and apply", async () => {
    srv.on("POST /config/plan", { status: 200, body: fakePlan() });
    srv.on("POST /config/apply", { status: 200, body: fakeApply("applied") });

    await syncCommand({ key: "sk_test_x", file: file(), adoptUnmanaged: true, archiveOrphaned: true, overwriteDrift: true });

    const want = { adoptUnmanaged: true, archiveOrphaned: true, overwriteDrift: true };
    expect(srv.requests.map((r) => r.body.options)).toEqual([want, want]);
  });

  it("says an old lock file is unused", async () => {
    fs.writeFileSync(path.join(dir, "infi.company.sandbox.lock.json"), "{}");
    srv.on("POST /config/plan", { status: 200, body: fakePlan() });

    await syncCommand({ key: "sk_test_x", file: file(), plan: true });

    expect(text()).toMatch(/infi\.company\.sandbox\.lock\.json is no longer used/);
  });
});

describe("infi pull", () => {
  it("writes the server's document (GET /config/document) as infi.company.ts", async () => {
    const doc = {
      schemaVersion: 1,
      products: [{ key: "ai-chat", type: "agent", pricingModel: "prepaid", billingCycle: "monthly", meters: [{ key: "tokens", unit: "token", aggregation: "sum" }], grants: [{ meter: "tokens", amount: "50000", on: "payment" }] }],
    };
    srv.on("GET /config/document", { status: 200, body: doc });
    const target = path.join(dir, "pulled.ts");

    await pullCommand({ key: "sk_test_x", file: target });

    const written = fs.readFileSync(target, "utf8");
    expect(written).toContain("defineCompany(");
    expect(written).toContain('"on": "payment"');
    expect(written).not.toContain("schemaVersion");
    expect(srv.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /config/document"]);
  });
});

describe("infi promote", () => {
  it("signs on sandbox, proposes on live, and prints the approval link", async () => {
    const receipt = { docHash: "abc", slug: "acme", sourceRevisionId: "crev_9", issuedAt: "2026-10-16T00:00:00Z", keyId: "k1", signature: "sig" };
    srv.on("POST /config/revisions/crev_9/promotion-receipt", { status: 200, body: { document: { schemaVersion: 1, products: [] }, receipt } });
    srv.on("POST /config/promote", { status: 202, body: { ...fakeApply("planned"), plan: fakePlan({ mode: "live" }) } });

    await promoteCommand({ revision: "crev_9", fromKey: "sk_test_a", toKey: "sk_live_b" });

    const [sign, promote] = srv.requests;
    expect(sign!.headers.authorization).toBe("Bearer sk_test_a");
    expect(promote!.headers.authorization).toBe("Bearer sk_live_b");
    expect(promote!.body.receipt).toEqual(receipt);
    expect(text()).toContain("/config/revisions/crev_1");
  });

  it("refuses without both keys", async () => {
    await expect(promoteCommand({ revision: "crev_9", fromKey: "sk_test_a" })).rejects.toMatchObject({
      code: "promotion_live_key_required",
    });
    expect(srv.requests).toHaveLength(0);
  });
});
