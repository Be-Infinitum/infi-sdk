/**
 * Infi MCP server — company as code + bootstrap + go-live guidance for agents.
 * Uses @beinfi/sdk and CLI libs underneath (ADR 0004).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Infi, COMPANY_INTENTS, type BillingConfig } from "@beinfi/sdk";
import { createClaimable, type ClaimRef } from "@beinfi/cli/claim";
import { runDoctor } from "@beinfi/cli/doctor";
import { getGoLiveStatus } from "@beinfi/cli/go-live";
import { runBootstrap, runAgentOnboarding } from "@beinfi/cli/bootstrap";
import { listSkills } from "@beinfi/cli/skills";
import { readFileSync } from "node:fs";

const API_BASE = (process.env.INFI_API_URL ?? "https://api-sandbox.beinfi.com").replace(/\/$/, "");

let activeKey: string | undefined;
let activeCwd: string | undefined;
let activeApiBase: string | undefined;

function client(): Infi {
  const key = activeKey ?? process.env.INFI_SECRET_KEY;
  if (!key) {
    throw new Error("INFI_SECRET_KEY is required for this tool (except claim/bootstrap).");
  }
  // Prefer SDK host inference; INFI_API_URL only for local overrides.
  return new Infi({
    secretKey: key,
    ...((activeApiBase ?? process.env.INFI_API_URL) ? { apiUrl: activeApiBase ?? process.env.INFI_API_URL } : {}),
  });
}

const server = new McpServer({ name: "infi", version: "0.2.0" }, {
  instructions: "Start with infi_onboard for a new integration. It returns missing questions; ask the human and call again with the answers and the same project cwd. Existing integrations should use doctor/sync. Sandbox provisioning needs no login. Only the human claims the account and completes production setup. Never ask for passwords or verification codes.",
});

const intentSchema = z.enum(["crm", "prepaid-ai-chat", "one-time", "usage-saas"]);

server.tool(
  "infi_onboard",
  "Conversational signup: ask for missing email, business name and intent, then provision a named sandbox with both test keys, configure the project and return the human completion link. Resume using the same cwd. Does not verify identity or enable production.",
  {
    email: z.string().email().max(254).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
    intent: intentSchema.optional(),
    ref: z.enum(["cli", "cursor", "mcp", "lovable"]).optional(),
    cwd: z.string().optional(),
  },
  async ({ email, accountName, intent, ref, cwd }) => {
    const result = await runAgentOnboarding({ email, accountName, intent, ref: ref ?? "mcp", cwd, json: true });
    if (result.status !== "requires_input") {
      activeKey = result.env.INFI_SECRET_KEY;
      activeCwd = cwd;
      activeApiBase = result.apiBase;
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "infi_claim_create",
  "Provision a claimable sandbox tenant (sk_test_ + claim URL). Use infi_bootstrap to also seed a catalog from an intent.",
  {
    ref: z.enum(["cli", "cursor", "mcp", "lovable"]).optional(),
    email: z.string().email().max(254).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
  },
  async ({ ref, email, accountName }) => {
    const claimable = await createClaimable(API_BASE, {
      ref: (ref ?? "mcp") as ClaimRef,
      email, accountName,
    });
    activeKey = claimable.apiKeySecret;
    activeApiBase = API_BASE;
    return { content: [{ type: "text", text: JSON.stringify(claimable, null, 2) }] };
  },
);

server.tool(
  "infi_bootstrap",
  `One-shot company setup: claim + infi.company.ts from intent + sync + doctor. Intents: ${COMPANY_INTENTS.join(", ")}.`,
  {
    intent: intentSchema,
    ref: z.enum(["cli", "cursor", "mcp", "lovable"]).optional(),
    cwd: z.string().optional(),
    email: z.string().email().max(254).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
  },
  async ({ intent, ref, cwd, email, accountName }) => {
    const result = await runBootstrap({
      intent, email, accountName,
      ref: (ref ?? "mcp") as ClaimRef,
      cwd,
      local: API_BASE.includes("localhost"),
      json: true,
    });
    activeKey = result.env.INFI_SECRET_KEY;
    activeCwd = cwd;
    activeApiBase = result.apiBase;
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "infi_doctor",
  "Diagnose tenant setup — products, legacy env. Returns JSON checks with fix commands.",
  {},
  async () => {
    const result = await runDoctor({
      local: API_BASE.includes("localhost"),
      json: true,
      key: activeKey ?? process.env.INFI_SECRET_KEY,
      cwd: activeCwd,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "infi_go_live_status",
  "Guide human go-live: claim → account → KYC → sk_live_. Returns stage, next, urls. Never invent live keys.",
  { claimId: z.string().optional() },
  async ({ claimId }) => {
    const status = await getGoLiveStatus({
      claimId,
      key: activeKey ?? process.env.INFI_SECRET_KEY,
      cwd: activeCwd,
      local: API_BASE.includes("localhost"),
      json: true,
    });
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  },
);

server.tool(
  "infi_sync_plan",
  "Dry-run company-as-code sync. Pass CompanyConfig JSON (defineCompany shape).",
  { config: z.record(z.unknown()) },
  async ({ config }) => {
    const cfg = config as unknown as BillingConfig;
    const result = await client().sync(cfg, { plan: true });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "infi_sync_apply",
  "Apply company-as-code config.",
  {
    config: z.record(z.unknown()),
    force: z.boolean().optional(),
  },
  async ({ config, force }) => {
    const cfg = config as unknown as BillingConfig;
    const result = await client().sync(cfg, { force: force ?? false });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "infi_pull",
  "Read tenant catalog + platform config from the backend.",
  {},
  async () => {
    const infi = client();
    const [products, webhooks] = await Promise.all([
      infi.products.list(),
      infi.webhooks.list(),
    ]);
    return {
      content: [{ type: "text", text: JSON.stringify({ products, webhooks }, null, 2) }],
    };
  },
);

// ── Skills as resources ─────────────────────────────────────────────────────
//
// The same integration recipes `infi skills install` copies into a project, served
// to clients that read resources instead of files (Cursor, Lovable). They come from
// @beinfi/cli, which already ships them, so there is exactly one copy of each and
// no chance of the two surfaces drifting.
//
// Registered eagerly, one resource per skill, rather than behind a template: a
// client that lists resources then sees the descriptions, which is how an agent
// decides which one it wants.
for (const skill of listSkills()) {
  server.resource(
    `skill-${skill.id}`,
    `infi://skills/${skill.id}`,
    { description: skill.description, mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: readFileSync(skill.file, "utf8"),
        },
      ],
    }),
  );
}

// An index, so a client that wants one read instead of N gets the whole menu.
server.resource(
  "skills",
  "infi://skills",
  { description: "Index of Infi integration skills, with when-to-use for each.", mimeType: "application/json" },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            skills: listSkills().map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              uri: `infi://skills/${s.id}`,
            })),
          },
          null,
          2,
        ),
      },
    ],
  }),
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
