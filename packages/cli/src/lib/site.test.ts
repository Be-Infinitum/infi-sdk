import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Infi } from "@beinfi/sdk";
import { devPort, registerSite } from "./site.js";

function project(scripts: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infi-site-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "loja-cafe", scripts }));
  return dir;
}

describe("site registration", () => {
  it("reads the dev port from next dev -p", () => {
    expect(devPort(project({ dev: "next dev -p 3111" }))).toBe(3111);
    expect(devPort(project({ dev: "next dev --port=4000" }))).toBe(4000);
    expect(devPort(project({ dev: "next dev" }))).toBe(3000);
  });

  it("registers the local and deployed callbacks under the project, and writes INFI_CLIENT_ID", async () => {
    const dir = project({ dev: "next dev -p 3111" });
    fs.writeFileSync(path.join(dir, ".env.local"), "INFI_SECRET_KEY=sk_test_x\n");
    const upsert = vi.fn(async (input: { name: string; redirectUris: string[] }) => ({
      clientId: "ic_abc",
      name: input.name,
      redirectUris: input.redirectUris,
      createdAt: "x",
    }));
    const infi = { oauthClients: { upsert } } as unknown as Infi;
    await registerSite(infi, dir, ["https://loja-cafe.vercel.app/"]);
    const input = upsert.mock.calls[0]![0];
    expect(input.name).toMatch(/^loja-cafe · proj_[0-9a-f]{16}$/);
    expect(input.redirectUris).toEqual([
      "http://localhost:3111/api/infi/auth/callback",
      "https://loja-cafe.vercel.app/api/infi/auth/callback",
    ]);
    const env = fs.readFileSync(path.join(dir, ".env.local"), "utf8");
    expect(env).toContain("INFI_SECRET_KEY=sk_test_x");
    expect(env).toContain("INFI_CLIENT_ID=ic_abc");
  });
});
