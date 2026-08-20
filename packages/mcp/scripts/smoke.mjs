/**
 * Publish gate: the bundle must actually start and speak MCP.
 *
 * @beinfi/mcp@0.1.1 shipped with TWO shebangs — one in src/index.ts, one from
 * tsup's banner — so the published file was a syntax error and `npx -y @beinfi/mcp`
 * could never run. Our own docs tell people to run it. Nothing caught it because
 * nothing ever executed the built artifact.
 *
 * Deliberately dependency-free: this repo installs with bun/pnpm (it uses the
 * `workspace:*` protocol), and a gate that only runs under one package manager is
 * a gate that gets skipped.
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

// The check that would have caught the second failure. Locally, @beinfi/cli
// resolves to the workspace copy, so anything we import exists. Published, it
// resolves from the registry through the declared range — and `^0.1.1` pins the
// MINOR on a 0.x version, so this package shipped against cli 0.1.1 while
// importing `@beinfi/cli/skills`, added in 0.2.2. It failed for users with
// ERR_PACKAGE_PATH_NOT_EXPORTED and passed every local test.
//
// So: the declared range must admit the version we actually test against.
const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"));
const cliRange = pkg.dependencies?.["@beinfi/cli"] ?? "";
const cliVersion = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../cli/package.json"), "utf8"),
).version;
const floor = /(\d+)\.(\d+)\.(\d+)/.exec(cliRange);
if (!floor) fail(`cannot read a version floor out of "@beinfi/cli": "${cliRange}"`);
const [rMajor, rMinor] = [Number(floor[1]), Number(floor[2])];
const [wMajor, wMinor] = cliVersion.split(".").map(Number);
if (cliRange.startsWith("^") && rMajor === 0) {
  fail(`"@beinfi/cli": "${cliRange}" — a caret on 0.x pins the minor, so this can never install ${cliVersion}. Use an explicit range.`);
}
if (rMajor !== wMajor || rMinor > wMinor) {
  fail(`"@beinfi/cli": "${cliRange}" does not admit the workspace version ${cliVersion} this was tested against`);
}

console.log(`smoke: bundle starts, speaks MCP, advertises resources; cli range ${cliRange} admits ${cliVersion}`);
