/**
 * Publish gate: the bundle must actually start and speak MCP.
 *
 * @beinfi/mcp@0.1.1 shipped with TWO shebangs — one in src/index.ts, one from
 * tsup's banner — so the published file was a syntax error and `npx -y @beinfi/mcp`
 * could never run. Our own docs tell people to run it. Nothing caught it because
 * nothing ever executed the built artifact.
 *
 * Deliberately dependency-free: adding a test runner here means `npm install` on
 * this monorepo, which does not currently work (packages/nextjs and examples/ use
 * the pnpm-only `workspace:*` protocol).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
const fail = (msg) => {
  console.error(`smoke: ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(dist)) fail(`no bundle at ${dist} — run build first`);

const lines = fs.readFileSync(dist, "utf8").split("\n");
if (lines[0] !== "#!/usr/bin/env node") fail(`first line is not a shebang: ${lines[0]}`);
const extra = lines.slice(1).filter((l) => l.startsWith("#!"));
if (extra.length > 0) fail(`${extra.length} extra shebang(s) — the bundle will not parse`);

const request =
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
  }) + "\n";

let reply;
try {
  const out = execFileSync("node", [dist], { input: request, encoding: "utf8", timeout: 20_000 });
  reply = JSON.parse(out.split("\n")[0]);
} catch (err) {
  fail(`the server did not start: ${err.message}`);
}

if (reply?.result?.serverInfo?.name !== "infi") fail(`unexpected initialize reply: ${JSON.stringify(reply)}`);
if (!reply?.result?.capabilities?.resources) fail("resources capability missing — skills are served as resources");

console.log("smoke: bundle starts, speaks MCP, advertises resources");
