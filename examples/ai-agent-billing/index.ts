/**
 * @beinfi/sdk — AI Agent Billing Demo
 *
 * End-to-end AI agent billing demo using billing-as-code:
 * 1. `infi.sync(infi.billing.ts)` — product + meters + prices
 * 2. Registers a customer, makes real AI calls, tracks usage
 * 3. Generates invoice, webhooks, payment flow
 *
 * Usage:
 *   INFI_SECRET_KEY=sk_test_xxx OPENAI_API_KEY=sk-xxx GOOGLE_GENERATIVE_AI_API_KEY=xxx bun run index.ts
 */
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import ngrok from "@ngrok/ngrok";
import { generateText } from "ai";
import {
  Infi,
  verifyWebhook,
  type PaymentConfirmedData,
  type WebhookEvent,
} from "@beinfi/sdk";
import billing, { PRODUCT_KEY } from "./infi.billing.js";

const API_KEY = process.env.INFI_SECRET_KEY;
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || "9876", 10);
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || "demo@example.com";

if (!API_KEY) {
  console.error("Set INFI_SECRET_KEY env var (e.g. sk_test_xxx)");
  process.exit(1);
}

const infi = new Infi({ secretKey: API_KEY, apiUrl: process.env.INFI_API_URL });

function header(text: string) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  ${text}`);
  console.log("=".repeat(50));
}

function startWebhookServer(secret: string, port: number) {
  const listeners = new Map<string, (event: WebhookEvent) => void>();

  const server = Bun.serve({
    port,
    async fetch(req) {
      if (req.method !== "POST") return new Response("OK", { status: 200 });

      const rawBody = await req.text();
      let event: WebhookEvent;
      try {
        event = verifyWebhook(
          {
            id: req.headers.get("x-webhook-id") || "",
            timestamp: req.headers.get("x-webhook-timestamp") || "",
            signature: req.headers.get("x-webhook-signature") || "",
            eventType: req.headers.get("x-webhook-event-type") || "",
            body: rawBody,
          },
          secret,
        );
      } catch {
        return new Response("Invalid signature", { status: 401 });
      }

      listeners.get(event.type)?.(event);
      return new Response("OK", { status: 200 });
    },
  });

  return {
    server,
    waitForEvent(eventType: string, timeoutMs = 30_000): Promise<WebhookEvent> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(eventType);
          reject(new Error(`Timeout waiting for ${eventType}`));
        }, timeoutMs);

        listeners.set(eventType, (event) => {
          clearTimeout(timer);
          listeners.delete(eventType);
          resolve(event);
        });
      });
    },
  };
}

let cleanedUp = false;
let activeTunnel: ngrok.Listener | null = null;
let webhookServer: { stop: () => void } | null = null;
let webhookId: string | undefined;

async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  console.log("\nCleaning up...");
  try {
    if (webhookId) await infi.webhooks.delete(webhookId);
  } catch {
    // best-effort
  }
  webhookServer?.stop();
  if (activeTunnel) {
    await ngrok.disconnect();
    console.log("Tunnel closed");
  }
}

async function main() {
  header("1. Sync billing (defineBilling)");

  const sync = await infi.sync(billing);
  console.log(`Synced (${sync.actions.length} actions):`, sync.actions.map((a) => a.action).join(", "));

  const product = (await infi.products.list()).find((p) => p.key === PRODUCT_KEY);
  if (!product?.id) throw new Error(`Product ${PRODUCT_KEY} not found after sync`);

  header("2. Register Customer");

  const enrollment = await infi.products.enroll(product.id, {
    externalId: "customer_001",
    name: "Acme Corp",
    email: CUSTOMER_EMAIL,
  });
  const customerId = enrollment.id!;
  console.log(`Customer registered: ${enrollment.externalId} (${enrollment.name})`);

  header("3. Start Webhook Listener");

  const listener = await ngrok.forward({ addr: WEBHOOK_PORT, authtoken_from_env: true });
  const tunnelUrl = listener.url()!;
  activeTunnel = listener;
  console.log(`Tunnel open: ${tunnelUrl} -> localhost:${WEBHOOK_PORT}`);

  const webhook = await infi.webhooks.create({
    url: tunnelUrl,
    events: ["invoice.finalized", "invoice.sent", "payment.confirmed", "payment.failed"],
  });
  webhookId = webhook.id;
  if (!webhook.secret) throw new Error("webhook endpoint returned no signing secret");

  const { server, waitForEvent } = startWebhookServer(webhook.secret, WEBHOOK_PORT);
  webhookServer = server;

  header("4. AI Agent Usage");
  const windowStart = new Date().toISOString();

  const prompts = [
    { prompt: "Summarize serverless in 2 sentences.", model: openai("gpt-4o-mini"), label: "gpt-4o-mini" },
    { prompt: "One paragraph fintech API marketing copy.", model: google("gemini-2.0-flash"), label: "gemini-2.0-flash" },
  ];

  const session = infi.session(customerId);
  let totalTokens = 0;

  for (const { prompt, model, label } of prompts) {
    const result = await generateText({ model, prompt });
    const tokens = result.usage.totalTokens ?? 0;
    totalTokens += tokens;
    session.track("tokens", tokens, { model: label });
    session.track("requests", 1, { model: label });
  }
  await session.flush();

  header("5. Check Usage");
  const usage = await infi.usage.get({ customerId, from: windowStart, to: new Date().toISOString() });
  for (const m of usage.meters) {
    console.log(`  ${m.meter}: ${m.totalValue} = ${m.totalAmount}`);
  }

  header("6. Generate Invoice");
  const invoice = await infi.invoices.fromUsage({ customerId, from: windowStart, to: new Date().toISOString() });
  console.log(`Invoice: ${invoice.invoiceNumber ?? invoice.id} — ${invoice.currency} ${invoice.total}`);

  header("7. Send Invoice Email");
  await infi.invoices.send(invoice.id!);

  header("8. Cleanup");
  await infi.webhooks.delete(webhook.id!);
  server.stop();
  await ngrok.disconnect();

  header("Done!");
  console.log(`Product: ${product.name}, Tokens: ${totalTokens}, Invoice: ${invoice.total}`);
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

main().catch(async (err) => {
  console.error("Script failed:", err);
  await cleanup();
  process.exit(1);
});
