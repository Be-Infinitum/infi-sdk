import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installSkills, listSkills } from "./skills.js";

const temps: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "infi-skills-"));
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("skills catalog", () => {
  it("ships the six integration recipes", () => {
    expect(listSkills().map((s) => s.id)).toEqual([
      "embed-checkout",
      "prepaid-ai-credits",
      "sell-digital-product",
      "send-payment-link",
      "test-payment-in-sandbox",
      "usage-based-subscription",
    ]);
  });

  // The three skills this replaced had no frontmatter at all, so nothing could
  // discover them — they were markdown files wearing a skill's name.
  it("every skill has a name matching its directory and a real description", () => {
    for (const s of listSkills()) {
      expect(s.name, s.id).toBe(s.id);
      expect(s.description.length, s.id).toBeGreaterThan(40);
    }
  });

  // They also pointed at infi.billing.ts / defineBilling, which bootstrap, sync,
  // pull and doctor all stopped using. An agent following that lands in a
  // divergent state and cannot tell.
  it("never mentions the retired config file or function", () => {
    for (const s of listSkills()) {
      const body = fs.readFileSync(s.file, "utf8");
      expect(body, s.id).not.toContain("infi.billing.ts");
      expect(body.replace(/`defineBilling` is the old\n?alias[^.]*\./s, ""), s.id).not.toMatch(
        /defineBilling\(/,
      );
    }
  });
});

describe("skills install", () => {
  it("copies into .claude/skills, where Claude Code looks", () => {
    const cwd = tmp();
    const res = installSkills({ which: ["sell-digital-product"], cwd });

    expect(res.installed).toEqual(["sell-digital-product"]);
    expect(fs.existsSync(path.join(cwd, ".claude/skills/sell-digital-product/SKILL.md"))).toBe(true);
  });

  it("refuses to overwrite without --force, because a user may have edited one", () => {
    const cwd = tmp();
    installSkills({ which: ["send-payment-link"], cwd });
    const file = path.join(cwd, ".claude/skills/send-payment-link/SKILL.md");
    fs.writeFileSync(file, "my edit");

    const again = installSkills({ which: ["send-payment-link"], cwd });
    expect(again.installed).toEqual([]);
    expect(again.skipped[0]?.reason).toContain("already installed");
    expect(fs.readFileSync(file, "utf8")).toBe("my edit");

    const forced = installSkills({ which: ["send-payment-link"], cwd, force: true });
    expect(forced.installed).toEqual(["send-payment-link"]);
    expect(fs.readFileSync(file, "utf8")).not.toBe("my edit");
  });

  it("reports an unknown name instead of failing the whole install", () => {
    const cwd = tmp();
    const res = installSkills({ which: ["nope", "send-payment-link"], cwd });

    expect(res.installed).toEqual(["send-payment-link"]);
    expect(res.skipped).toEqual([{ id: "nope", reason: "unknown skill" }]);
  });

  it("installs all of them when none is named", () => {
    const cwd = tmp();
    expect(installSkills({ which: [], cwd }).installed).toHaveLength(listSkills().length);
  });
});
