import { describe, expect, it } from "vitest";
import { Infi } from "./client.js";
import { companyFromIntent } from "./company-intents.js";

// Optional end to end against the real sandbox. Runs only with a sandbox key in
// INFI_E2E_SECRET_KEY (never a live key), and only plans: it writes nothing.
const key = process.env.INFI_E2E_SECRET_KEY;
const run = key?.startsWith("sk_test_") ? describe : describe.skip;

run("e2e: /config on the sandbox", () => {
  const infi = new Infi({ secretKey: key!, ...(process.env.INFI_API_URL ? { apiUrl: process.env.INFI_API_URL } : {}) });

  it("plans an intent's document and pulls a document that plans to no change", async () => {
    const planned = await infi.sync(companyFromIntent("usage-saas"), { plan: true, locale: "en" });
    expect(planned.status).toBe("planned");
    expect(planned.plan.planHash).toBeTruthy();
    for (const c of planned.plan.changes) expect(c.sentence).toBeTruthy();

    const doc = await infi.config.document();
    expect(doc.schemaVersion).toBe(1);
    if (doc.products.length) {
      const again = await infi.config.plan(doc, {}, { locale: "en" });
      expect(again.changes.filter((c) => c.action !== "skip")).toEqual([]);
    }
  }, 30_000);
});
