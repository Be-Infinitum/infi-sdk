import { describe, expect, it } from "vitest";
import { GraceLedger, parseDuration, resolveGrace } from "./grace.js";
import type { PaymentPayload, PaymentRequirements } from "./types.js";

function ledger(
  policy: Parameters<typeof resolveGrace>[0],
  backend?: Parameters<typeof resolveGrace>[1],
  clock?: () => number,
): GraceLedger {
  return new GraceLedger(resolveGrace(policy, backend), clock);
}

describe("parseDuration", () => {
  it("reads the units a merchant actually writes", () => {
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("90s")).toBe(90_000);
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration(250)).toBe(250);
  });

  it("refuses a duration it would have to guess at", () => {
    expect(() => parseDuration("5 minutes")).toThrow(/invalid duration/);
    expect(() => parseDuration("")).toThrow(/invalid duration/);
  });
});

describe("resolveGrace", () => {
  it("is disabled when nothing configured it — failing closed is the default", () => {
    expect(resolveGrace(undefined, undefined)).toBeNull();
    expect(resolveGrace(false, { maxPerAgent: "0.50" })).toBeNull();
    expect(resolveGrace({ maxPerAgent: "0" }, undefined)).toBeNull();
  });

  it("takes the tenant's policy from the backend when the merchant said nothing", () => {
    const policy = resolveGrace(undefined, { window: "5m", maxPerAgent: "0.50" });
    expect(policy).toMatchObject({ windowMs: 300_000, maxPerAgent: "0.5" });
  });

  it("lets the merchant override the backend", () => {
    const policy = resolveGrace({ window: "30s", maxPerAgent: "0.10" }, {
      window: "5m",
      maxPerAgent: "0.50",
    });
    expect(policy).toMatchObject({ windowMs: 30_000, maxPerAgent: "0.1" });
  });

  // maxTotal is the only cap that binds against a hostile client: during grace
  // the payer address is unverified, so a caller forges a fresh address per
  // request and mints a fresh per-agent bucket each time. Dropping the tenant's
  // maxTotal because the merchant did not repeat it locally leaves the process
  // bounded by nothing at all.
  it("takes maxTotal from the backend, not only from the merchant", () => {
    const policy = resolveGrace(undefined, {
      window: "5m",
      maxPerAgent: "0.50",
      maxTotal: "5.00",
    });
    expect(policy).toMatchObject({ maxPerAgent: "0.5", maxTotal: "5" });
  });

  it("still lets the merchant tighten the total below the tenant's", () => {
    const policy = resolveGrace({ maxPerAgent: "0.50", maxTotal: "1.00" }, {
      maxPerAgent: "0.50",
      maxTotal: "5.00",
    });
    expect(policy).toMatchObject({ maxTotal: "1" });
  });
});

describe("GraceLedger allowance", () => {
  it("spends down to the cap and then refuses", () => {
    const g = ledger({ window: "5m", maxPerAgent: "0.01" });
    expect(g.spend("0xAgent", "0.005")).toEqual({ ok: true, remaining: "0.005" });
    expect(g.spend("0xAgent", "0.005")).toEqual({ ok: true, remaining: "0" });
    // Exhausted: the caller must refuse with 402 verification_unavailable, not serve.
    expect(g.spend("0xAgent", "0.005")).toEqual({ ok: false, reason: "agent_allowance_exhausted" });
  });

  it("treats the address case-insensitively — one agent, one bucket", () => {
    const g = ledger({ window: "5m", maxPerAgent: "0.01" });
    g.spend("0xABC", "0.006");
    expect(g.remainingFor("0xabc")).toBe("0.004");
  });

  it("issues a fresh allowance in the next window", () => {
    let now = 1_000;
    const g = ledger({ window: "5m", maxPerAgent: "0.01" }, undefined, () => now);
    g.spend("0xAgent", "0.01");
    expect(g.spend("0xAgent", "0.001").ok).toBe(false);
    now += 300_001;
    expect(g.spend("0xAgent", "0.001")).toEqual({ ok: true, remaining: "0.009" });
  });

  it("bounds the process with maxTotal, which is what a forged payer cannot get around", () => {
    // The hazard the spec does not name: `from` comes out of an UNVERIFIED
    // payload during an outage, so a hostile client mints a fresh per-agent
    // bucket per request. Only the process total holds.
    const g = ledger({ window: "5m", maxPerAgent: "0.50", maxTotal: "0.02" });
    expect(g.spend("0xa".padEnd(42, "1"), "0.01").ok).toBe(true);
    expect(g.spend("0xb".padEnd(42, "2"), "0.01").ok).toBe(true);
    expect(g.spend("0xc".padEnd(42, "3"), "0.01")).toEqual({
      ok: false,
      reason: "process_allowance_exhausted",
    });
    expect(g.remainingTotal()).toBe("0");
  });

  it("is disabled when there is no policy", () => {
    const g = ledger(undefined, undefined);
    expect(g.enabled).toBe(false);
    expect(g.spend("0xAgent", "0.001")).toEqual({ ok: false, reason: "disabled" });
  });

  it("evicts the least recently seen agent rather than growing forever", () => {
    const g = ledger({ window: "5m", maxPerAgent: "0.01", maxAgents: 2 });
    g.spend("0x1", "0.005");
    g.spend("0x2", "0.005");
    g.spend("0x3", "0.005"); // evicts 0x1
    expect(g.remainingFor("0x2")).toBe("0.005");
  });
});

describe("GraceLedger replay guard", () => {
  it("claims a nonce once — the half of UNIQUE(network,payer,nonce) that survives an outage", () => {
    const g = ledger({ window: "5m", maxPerAgent: "0.50" });
    expect(g.claimNonce("base:0xa:0xnonce")).toBe(true);
    expect(g.claimNonce("base:0xa:0xnonce")).toBe(false);
  });
});

describe("GraceLedger queue", () => {
  const payload = { x402Version: 1, scheme: "exact", network: "base", payload: {} } as PaymentPayload;
  const requirements = {} as PaymentRequirements;

  function item(nonce: string) {
    return {
      payment: "b64",
      paymentPayload: payload,
      paymentRequirements: requirements,
      product: "serp-api",
      meter: "searches",
      quantity: "1",
      network: "base",
      payer: "0xAgent",
      nonce,
      releasedAt: 0,
    };
  }

  it("holds payloads for replay and drains them oldest first", () => {
    const g = ledger({ window: "5m", maxPerAgent: "0.50" });
    g.enqueue(item("0x1"));
    g.enqueue(item("0x2"));
    expect(g.pending).toBe(2);
    expect(g.drain().map((q) => q.nonce)).toEqual(["0x1", "0x2"]);
    expect(g.pending).toBe(0);
  });

  it("drops the oldest when the queue is full, and counts it", () => {
    const g = ledger({ window: "5m", maxPerAgent: "0.50", queueLimit: 1 });
    g.enqueue(item("0x1"));
    g.enqueue(item("0x2"));
    expect(g.pending).toBe(1);
    expect(g.droppedCount).toBe(1);
    expect(g.drain()[0]?.nonce).toBe("0x2");
  });

  it("attaches a real quantity to a queued payload (settle during an outage)", () => {
    const g = ledger({ window: "5m", maxPerAgent: "0.50" });
    g.enqueue(item("0x1"));
    expect(g.updateQuantity("base", "0xAgent", "0x1", "137")).toBe(true);
    expect(g.updateQuantity("base", "0xAgent", "0xmissing", "137")).toBe(false);
    expect(g.drain()[0]?.quantity).toBe("137");
  });
});
