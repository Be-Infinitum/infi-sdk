import { describe, expect, it } from "vitest";
import {
  atomicForQuantity,
  atomicFromDecimal,
  compareAtomic,
  compareDecimal,
  decimalFromAtomic,
  normalizeDecimal,
  subtractDecimalClamped,
} from "./amount.js";

/**
 * RISK ZONE (money). These are the tests that catch a factor of 10^6, which is
 * the one mistake on this path that still looks like a plausible amount.
 */
describe("atomic <-> decimal", () => {
  it("5000 atomic is 0.005 USDC at six decimals — both directions", () => {
    expect(decimalFromAtomic("5000", 6)).toBe("0.005");
    expect(atomicFromDecimal("0.005", 6)).toBe("5000");
  });

  it("does not confuse the decimal amount with the atomic one", () => {
    // The failure mode: shipping "0.005" as maxAmountRequired, or "5000" as the
    // charge. One undercharges by a million, the other overcharges by a million.
    expect(atomicFromDecimal("0.005", 6)).not.toBe("0.005");
    expect(decimalFromAtomic("5000", 6)).not.toBe("5000");
    expect(atomicFromDecimal("5", 6)).toBe("5000000");
  });

  it("takes decimals from the asset, not from a constant", () => {
    // Same amount, three tokens. Hardcoding 6 is wrong twice here.
    expect(atomicFromDecimal("1.5", 6)).toBe("1500000");
    expect(atomicFromDecimal("1.5", 18)).toBe("1500000000000000000");
    expect(atomicFromDecimal("1.5", 0)).toBe("2"); // rounds up: see below
    expect(decimalFromAtomic("1500000000000000000", 18)).toBe("1.5");
  });

  it("keeps full precision on 18-decimal tokens (no float rounding)", () => {
    const atomic = "123456789012345678";
    expect(decimalFromAtomic(atomic, 18)).toBe("0.123456789012345678");
    expect(atomicFromDecimal("0.123456789012345678", 18)).toBe(atomic);
  });

  it("rounds UP to the asset's smallest unit", () => {
    // A ceiling that rounded down would sell the fraction for free. §5.1's
    // true-up credits whatever the agent did not use.
    expect(atomicFromDecimal("0.0000005", 6)).toBe("1");
    expect(atomicFromDecimal("0.0000010", 6)).toBe("1");
    expect(atomicFromDecimal("0.0000011", 6)).toBe("2");
  });

  it("refuses a float, because a float price is already wrong", () => {
    expect(() => atomicFromDecimal(0.005, 6)).toThrow(/non-negative decimal/);
    expect(() => atomicFromDecimal("-1", 6)).toThrow(/non-negative decimal/);
    expect(() => atomicFromDecimal("1e-6", 6)).toThrow(/non-negative decimal/);
    expect(() => decimalFromAtomic("0.5", 6)).toThrow(/atomic amount/);
  });

  it("refuses implausible asset decimals", () => {
    expect(() => atomicFromDecimal("1", -1)).toThrow(/asset decimals/);
    expect(() => atomicFromDecimal("1", 6.5)).toThrow(/asset decimals/);
  });
});

describe("atomicForQuantity", () => {
  it("prices a fixed route", () => {
    expect(atomicForQuantity("0.005", 1, 6)).toBe("5000");
  });

  it("prices a variable route at its ceiling", () => {
    // 8000 tokens at $0.0001 = $0.80 = 800000 atomic units.
    expect(atomicForQuantity("0.0001", 8000, 6)).toBe("800000");
  });

  it("multiplies without touching a float", () => {
    // 0.1 * 3 is 0.30000000000000004 in IEEE754. Not here.
    expect(atomicForQuantity("0.1", 3, 6)).toBe("300000");
    expect(atomicForQuantity("0.0000001", 1, 6)).toBe("1"); // rounded up
  });
});

describe("comparisons and grace arithmetic", () => {
  it("compares atomic strings as numbers, not as text", () => {
    expect(compareAtomic("9", "10")).toBe(-1);
    expect(compareAtomic("5000", "5000")).toBe(0);
    expect(compareAtomic("100000000000000000000", "99999999999999999999")).toBe(1);
  });

  it("compares decimals across differing scales", () => {
    expect(compareDecimal("0.50", "0.5")).toBe(0);
    expect(compareDecimal("0.5", "0.45")).toBe(1);
  });

  it("debits an allowance without going negative", () => {
    expect(subtractDecimalClamped("0.50", "0.005")).toBe("0.495");
    expect(subtractDecimalClamped("0.005", "0.50")).toBe("0");
    expect(normalizeDecimal("0.500")).toBe("0.5");
  });
});
