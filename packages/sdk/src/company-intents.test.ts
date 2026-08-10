import { describe, expect, it } from "vitest";
import { companyFromIntent } from "./company-intents.js";
import { defineCompany } from "./company.js";

describe("companyFromIntent", () => {
  it("builds crm config with leads meter", () => {
    const cfg = defineCompany.fromIntent("crm");
    expect(cfg.products[0]?.key).toBe("crm");
    expect(cfg.products[0]?.meters?.[0]?.key).toBe("leads_ingested");
  });

  it("builds prepaid-ai-chat with tokens meter + cycle grant", () => {
    const cfg = companyFromIntent("prepaid-ai-chat");
    expect(cfg.products[0]?.pricingModel).toBe("prepaid");
    expect(cfg.products[0]?.meters?.[0]?.key).toBe("tokens");
    expect(cfg.products[0]?.grants).toEqual([
      { meter: "tokens", amount: "50000", on: "cycle" },
    ]);
  });

});

