import { describe, expect, it } from "vitest";
import { companyFromIntent } from "./company-intents.js";
import { defineCompany, withAppUrl } from "./company.js";

describe("companyFromIntent", () => {
  it("builds crm config with leads meter", () => {
    const cfg = defineCompany.fromIntent("crm", { appUrl: "https://x.lovable.app" });
    expect(cfg.products[0]?.key).toBe("crm");
    expect(cfg.products[0]?.meters?.[0]?.key).toBe("leads_ingested");
    expect(cfg.apps?.[0]?.allowedOrigins).toContain("https://x.lovable.app");
    expect(cfg.apps?.[0]?.redirectUris).toContain("https://x.lovable.app/callback");
  });

  it("builds prepaid-ai-chat with tokens meter + cycle grant", () => {
    const cfg = companyFromIntent("prepaid-ai-chat");
    expect(cfg.products[0]?.pricingModel).toBe("prepaid");
    expect(cfg.products[0]?.meters?.[0]?.key).toBe("tokens");
    expect(cfg.products[0]?.grants).toEqual([
      { meter: "tokens", amount: "50000", on: "cycle" },
    ]);
  });

  it("one-time skips apps without appUrl", () => {
    const cfg = companyFromIntent("one-time", { price: "9.90" });
    expect(cfg.apps).toBeUndefined();
    expect(cfg.products[0]?.pricingModel).toBe("one_time");
  });
});

describe("withAppUrl", () => {
  it("merges origins into existing apps", () => {
    const base = defineCompany({
      products: [{ key: "x", type: "agent", pricingModel: "usage" }],
      apps: [{ slug: "x", name: "X", allowedOrigins: ["http://localhost:3000"], redirectUris: [] }],
    });
    const next = withAppUrl(base, "https://prod.app");
    expect(next.apps?.[0]?.allowedOrigins).toEqual(
      expect.arrayContaining(["http://localhost:3000", "https://prod.app"]),
    );
  });
});
