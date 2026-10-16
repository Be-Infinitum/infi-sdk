import { describe, expect, it } from "vitest";
import { companyFromIntent } from "./company-intents.js";
import { defineCompany } from "./company.js";

describe("companyFromIntent", () => {
  it("has no crm preset (ADR 0024)", () => {
    expect(() => defineCompany.fromIntent("crm" as never)).toThrow(/Unknown company intent/);
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

