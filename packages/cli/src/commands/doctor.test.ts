import { describe, expect, it, vi } from "vitest";
import { runDoctor } from "./doctor.js";

vi.mock("../lib/client.js", () => ({
  apiBase: () => "http://localhost:8088",
  resolveSecretKey: () => "sk_test_abc",
  infiClient: () => ({
    products: {
      list: vi.fn().mockResolvedValue([{ id: "p1", key: "demo" }]),
    },
    apps: {
      list: vi.fn().mockResolvedValue([
        { id: "a1", slug: "demo-app", allowedOrigins: ["http://localhost:3000"] },
      ]),
    },
  }),
}));

describe("runDoctor", () => {
  it("passes when products and app exist", async () => {
    process.env.NEXT_PUBLIC_INFI_APP_SLUG = "demo-app";
    const result = await runDoctor({ local: true, json: false });
    expect(result.ok).toBe(true);
    expect(result.checks.some((c) => c.id === "products" && c.status === "pass")).toBe(true);
  });
});
