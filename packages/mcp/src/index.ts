/**
 * Infi MCP server — company as code + bootstrap + go-live guidance for agents.
 * Uses @beinfi/sdk and CLI libs underneath (ADR 0004).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Infi, COMPANY_INTENTS, type BillingConfig, type SyncResult } from "@beinfi/sdk";
import { createClaimable, type ClaimRef } from "@beinfi/cli/claim";
import { runDoctor } from "@beinfi/cli/doctor";
import { getGoLiveStatus } from "@beinfi/cli/go-live";
import { runBootstrap, runAgentOnboarding } from "@beinfi/cli/bootstrap";
import { listSkills } from "@beinfi/cli/skills";
import { agentWriteRefusal } from "@beinfi/cli/agent-guard";
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

/**
 * Refuse a write before it reaches the network. `key` is the one the tool would
 * act with; provisioning tools pass the configured key, since a live project is
 * no place to provision a sandbox (bootstrap rewrites `.env.local`).
 */
function refuse(tool: string, key: string | undefined) {
  const message = agentWriteRefusal(tool, key);
  return message ? { isError: true, content: [{ type: "text" as const, text: message }] } : undefined;
}

const syncOptionsShape = {
  adoptUnmanaged: z.boolean().optional().describe("Take over resources the config names that no revision wrote (first sync of a tenant built by hand or by an older client)."),
  archiveOrphaned: z.boolean().optional().describe("Archive managed resources the config no longer names. Nothing is deleted."),
  overwriteDrift: z.boolean().optional().describe("Let the config win over edits made outside it (dashboard). Ask the human first."),
};

/** The sync result as the agent should read it: the document it sent is noise. */
function syncReply(result: SyncResult) {
  const { document: _doc, ...rest } = result;
  const json = JSON.stringify(rest, null, 2);
  const say = (lead: string, isError = false) => ({
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text" as const, text: `${lead}\n${json}` }],
  });
  switch (result.status) {
    case "proposed":
      return say(
        `Proposed, not applied: on live every change waits for a person. Give the human this link to review and approve it: ${result.approvalUrl}\n` +
          "Do not call infi_sync_apply again for this change; approving is theirs (dashboard, step-up).",
      );
    case "applied":
      return say(
        result.secrets?.length
          ? "Applied. `secrets` holds the signing secret of each new webhook endpoint, shown only this once: store it in the app's server secrets now (never in the repo)."
          : "Applied.",
      );
    case "unchanged":
      return say("Nothing to apply: the tenant matches the config.");
    case "planned":
      return say(result.plan.blocked ? "Plan (held changes in `held`, each with what resolves it):" : "Plan. Show these sentences to the human before applying:");
    case "stale":
      return say("Not applied: the tenant changed since the plan. `plan` is the plan now: show it to the human and apply only if they agree.", true);
    case "blocked":
      return say(
        "Blocked: nothing was applied. Each entry in `held` names the option that resolves it, or says none can. Ask the human which to use; never pick overwriteDrift on your own.",
        true,
      );
  }
}

const server = new McpServer({ name: "infi", version: "0.2.0" }, {
  instructions: "Start with infi_onboard for a new integration. It returns missing questions; ask the human and call again with the answers and the same project cwd. Existing integrations should use doctor/sync. Sandbox provisioning needs no login. Only the human claims the account and completes production setup. Never ask for passwords or verification codes. With a live key, infi_sync_apply only proposes: it returns an approval link the human opens; it never changes live by itself.",
});

const intentSchema = z.enum(COMPANY_INTENTS as [string, ...string[]]);

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
    const refusal = refuse("infi_onboard", process.env.INFI_SECRET_KEY);
    if (refusal) return refusal;
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
    const refusal = refuse("infi_claim_create", process.env.INFI_SECRET_KEY);
    if (refusal) return refusal;
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
    const refusal = refuse("infi_bootstrap", process.env.INFI_SECRET_KEY);
    if (refusal) return refusal;
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
  "Guide human go-live: claim → merchant-of-record admission (dashboard /go-live) → sk_live_. Returns stage, next, urls. Never invent live keys and never fill the admission yourself.",
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
  "Plan company-as-code on the server (POST /config/plan). Pass the CompanyConfig JSON (defineCompany shape). Writes nothing; works with any key. Returns the changes in sentences; show them to the human.",
  { config: z.record(z.unknown()), ...syncOptionsShape },
  async ({ config, ...options }) => {
    const result = await client().sync(config as unknown as BillingConfig, { ...options, plan: true });
    return syncReply(result);
  },
);

server.tool(
  "infi_sync_apply",
  "Apply company-as-code through the server: plan, then apply with the plan's hash. Sandbox key: applies and returns new webhook secrets once. Live key: only PROPOSES — returns an approvalUrl the human opens to approve (dashboard, step-up); it never changes live by itself and must not be retried. Held changes come back with the option that resolves each (adoptUnmanaged, archiveOrphaned, overwriteDrift).",
  { config: z.record(z.unknown()), ...syncOptionsShape },
  async ({ config, ...options }) => {
    const result = await client().sync(config as unknown as BillingConfig, options);
    return syncReply(result);
  },
);

server.tool(
  "infi_pull",
  "The tenant as a company document (GET /config/document) — the server's own export; planning it changes nothing. Write it to infi.company.ts as defineCompany({...}) without schemaVersion.",
  {},
  async () => {
    const document = await client().config.document();
    return { content: [{ type: "text", text: JSON.stringify(document, null, 2) }] };
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
