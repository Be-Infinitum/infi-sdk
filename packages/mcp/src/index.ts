#!/usr/bin/env node
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
import { runBootstrap } from "@beinfi/cli/bootstrap";

const API_BASE = (process.env.INFI_API_URL ?? "https://api-sandbox.beinfi.com").replace(/\/$/, "");

function client(): Infi {
  const key = process.env.INFI_SECRET_KEY;
  if (!key) {
    throw new Error("INFI_SECRET_KEY is required for this tool (except claim/bootstrap).");
  }
  // Prefer SDK host inference; INFI_API_URL only for local overrides.
  return new Infi({
    secretKey: key,
    ...(process.env.INFI_API_URL ? { apiUrl: process.env.INFI_API_URL } : {}),
  });
}

const server = new McpServer({ name: "infi", version: "0.2.0" });

const intentSchema = z.enum(["crm", "prepaid-ai-chat", "one-time", "usage-saas"]);

server.tool(
  "infi_claim_create",
  "Provision a claimable sandbox tenant (sk_test_ + claim URL). Optional intent for the seed catalog.",
  {
    ref: z.enum(["cli", "cursor", "mcp", "lovable"]).optional(),
    intent: intentSchema.optional(),
  },
  async ({ ref, intent }) => {
    const claimable = await createClaimable(API_BASE, {
      ref: (ref ?? "mcp") as ClaimRef,
      intent,
    });
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
  },
  async ({ intent, ref, cwd }) => {
    const result = await runBootstrap({
      intent,
      ref: (ref ?? "mcp") as ClaimRef,
      cwd,
      local: API_BASE.includes("localhost"),
      json: true,
    });
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
      key: process.env.INFI_SECRET_KEY,
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
      key: process.env.INFI_SECRET_KEY,
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

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
