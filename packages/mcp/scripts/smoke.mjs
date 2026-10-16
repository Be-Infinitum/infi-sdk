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

// Exercise the actual tool over stdio without provisioning an account.
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
const os = await import("node:os");
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "infi-mcp-onboard-"));
const transport = new StdioClientTransport({ command: "node", args: [dist], env: { PATH: process.env.PATH ?? "" } });
const client = new Client({ name: "onboarding-smoke", version: "1" });
try {
  await client.connect(transport);
  const result = await client.callTool({ name: "infi_onboard", arguments: { cwd, accountName: "Acme" } });
  const payload = JSON.parse(result.content[0].text);
  if (payload.status !== "requires_input" || payload.missingFields.join(",") !== "email,intent") throw new Error("incorrect missing-field response");
  if (fs.readdirSync(cwd).length) throw new Error("asking questions wrote files");
  console.log("smoke: infi_onboard asks only missing questions over stdio, without provisioning");
} finally {
  await client.close();
  fs.rmSync(cwd, { recursive: true, force: true });
}

// With a live key, an agent only proposes (ADR 0025). infi_sync_apply plans and
// applies through the server, which answers 202 with an approval link; the tool
// hands the link back and never applies or retries. Provisioning tools still
// refuse a live key before touching the network or the disk.
{
  const http = await import("node:http");
  const requests = [];
  const plan = {
    docHash: "d", stateHash: "s", planHash: "ph_smoke", baseRevision: null, mode: "live", options: {},
    hasChanges: true, blocked: false, orphaned: [], unmanaged: [], drift: [],
    changes: [{ action: "create", resource: "product", ref: "ebook", key: "ebook", sentence: "Create the product ebook." }],
  };
  const approvalUrl = "https://app.beinfi.com/config/revisions/crev_smoke";
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method, path: req.url, idem: req.headers["idempotency-key"], body: body ? JSON.parse(body) : undefined });
      const send = (status, payload) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (req.method === "POST" && req.url === "/config/plan") return send(200, plan);
      if (req.method === "POST" && req.url === "/config/apply") {
        return send(202, {
          revision: { id: "crev_smoke", number: 7, status: "planned", mode: "live", docHash: "d", planHash: "ph_smoke", author: { kind: "api_key", id: "k" }, createdAt: "2026-10-16T00:00:00Z" },
          approvalUrl,
        });
      }
      send(404, { message: "not found", error_code: "not_found", tracer_id: "t" });
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  const apiUrl = `http://127.0.0.1:${fake.address().port}`;

  const liveCwd = fs.mkdtempSync(path.join(os.tmpdir(), "infi-mcp-live-"));
  const live = new Client({ name: "live-guard-smoke", version: "1" });
  const env = { PATH: process.env.PATH ?? "", INFI_SECRET_KEY: "sk_live_smoke", INFI_API_URL: apiUrl };
  try {
    await live.connect(new StdioClientTransport({ command: "node", args: [dist], env, cwd: liveCwd }));

    const config = { products: [{ key: "ebook", type: "item", pricingModel: "one_time", basePrice: "19.90" }] };
    const r = await live.callTool({ name: "infi_sync_apply", arguments: { config, overwriteDrift: true } });
    const text = r.content[0].text;
    if (r.isError) throw new Error(`infi_sync_apply errored on live: ${text}`);
    if (!text.includes(approvalUrl) || !/Proposed, not applied/.test(text)) throw new Error(`no approval link in: ${text}`);
    const seen = requests.map((q) => `${q.method} ${q.path}`);
    if (seen.join(",") !== "POST /config/plan,POST /config/apply") throw new Error(`unexpected requests: ${seen}`);
    const apply = requests[1];
    if (apply.idem !== "ph_smoke" || apply.body.planHash !== "ph_smoke") throw new Error("apply did not carry Idempotency-Key = planHash");
    console.log("smoke: with a live key infi_sync_apply proposes — one plan, one apply (Idempotency-Key = planHash), 202 → approval link");

    requests.length = 0;
    const provisioning = [
      ["infi_bootstrap", { intent: "usage-saas", cwd: liveCwd }],
      ["infi_onboard", { cwd: liveCwd, email: "a@b.test", accountName: "Acme", intent: "usage-saas" }],
      ["infi_claim_create", {}],
    ];
    for (const [name, args] of provisioning) {
      const p = await live.callTool({ name, arguments: args });
      if (!p.isError || !/refused: .*live key/.test(p.content[0].text)) {
        throw new Error(`${name} did not refuse a live key: ${JSON.stringify(p)}`);
      }
    }
    if (requests.length) throw new Error(`a refused provisioning call reached the API: ${JSON.stringify(requests)}`);
    if (fs.readdirSync(liveCwd).length) throw new Error("a live call left files behind");
    console.log("smoke: with a live key provisioning tools refuse, before network or disk");
  } finally {
    await live.close();
    fake.close();
    fs.rmSync(liveCwd, { recursive: true, force: true });
  }
}
