#!/usr/bin/env node
/**
 * Infi MCP server — exposes CLI-equivalent operations to Cursor/Claude agents.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Infi, type BillingConfig } from "@beinfi/sdk";
import { createClaimable, type ClaimRef } from "@beinfi/cli/claim";
import { runDoctor } from "@beinfi/cli/doctor";

const API_BASE = (process.env.INFI_API_URL ?? "https://api-sandbox.beinfi.com").replace(/\/$/, "");

function client(): Infi {
  const key = process.env.INFI_SECRET_KEY;
  if (!key) throw new Error("INFI_SECRET_KEY is required for MCP tools (except infi_claim_create).");
  return new Infi({ secretKey: key, apiUrl: API_BASE });
}

const server = new McpServer({ name: "infi", version: "0.1.0" });

server.tool(
  "infi_claim_create",
  "Provision a claimable sandbox tenant (instant sk_test_ key + claim URL). No secret key required.",
  { ref: z.enum(["cli", "cursor", "mcp", "lovable"]).optional() },
  async ({ ref }) => {
    const claimable = await createClaimable(API_BASE, (ref ?? "mcp") as ClaimRef);
    return { content: [{ type: "text", text: JSON.stringify(claimable, null, 2) }] };
  },
);

server.tool(
  "infi_doctor",
  "Diagnose tenant setup — products, apps, env mistakes. Returns JSON checks with fix commands.",
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
  "infi_sync_plan",
  "Dry-run billing-as-code sync. Pass BillingConfig JSON (same shape as defineBilling()).",
  { config: z.record(z.unknown()) },
  async ({ config }) => {
    const result = await client().sync(config as unknown as BillingConfig, { plan: true });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "infi_sync_apply",
  "Apply billing-as-code config to the tenant.",
  { config: z.record(z.unknown()), force: z.boolean().optional() },
  async ({ config, force }) => {
    const result = await client().sync(config as unknown as BillingConfig, { force: force ?? false });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "infi_pull",
  "Read tenant catalog + platform config from the backend.",
  {},
  async () => {
    const infi = client();
    const [products, apps, webhooks] = await Promise.all([
      infi.products.list(),
      infi.apps.list(),
      infi.webhooks.list(),
    ]);
    return {
      content: [{ type: "text", text: JSON.stringify({ products, apps, webhooks }, null, 2) }],
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
