import { describe, expect, it } from "vitest";
import { parseArgs, globalFlags } from "./parse.js";

describe("parseArgs", () => {
  it("parses command and flags", () => {
    const p = parseArgs(["sandbox", "create", "--json", "--local"]);
    expect(p.command).toBe("sandbox");
    expect(p.sub).toBe("create");
    expect(p.flags.json).toBe(true);
    expect(p.flags.local).toBe(true);
  });

  it("globalFlags extracts key and profile", () => {
    const gf = globalFlags({ key: "sk_test_x", profile: "work" });
    expect(gf.key).toBe("sk_test_x");
    expect(gf.profile).toBe("work");
  });
});
