/**
 * @beinfi/sdk — AI Agent Billing Demo
 *
 * End-to-end AI agent billing demo that:
 * 1. Creates a product + meters (+ prices) for token-based billing
 * 2. Registers a customer with email
 * 3. Opens an ngrok tunnel and registers a webhook with Beinfi
 * 4. Makes real AI calls (OpenAI + Gemini) and tracks token usage
 * 5. Reads the usage, generates an invoice, waits for the invoice webhook
 * 6. Sends the invoice email and waits for `payment.confirmed`
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

// ── Config ──────────────────────────────────────────
const API_KEY = process.env.INFI_SECRET_KEY;
const BASE_URL = process.env.INFI_API_URL || "https://api-sandbox.beinfi.com";
const PAY_BASE = process.env.INFI_PAY_BASE_URL || "https://app.beinfi.com";
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || "9876", 10);
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || "demo@example.com";
const CURRENCY = "BRL";
const TOKEN_PRICE = "0.0001";
const REQUEST_PRICE = "0.005";

if (!API_KEY) {
  console.error("Set INFI_SECRET_KEY env var (e.g. sk_test_xxx)");
  process.exit(1);
}

const infi = new Infi({ secretKey: API_KEY, baseUrl: BASE_URL, payBaseUrl: PAY_BASE });

// ── Helpers ─────────────────────────────────────────
function header(text: string) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  ${text}`);
  console.log("=".repeat(50));
}

// ── Webhook Server ─────────────────────────────────
function startWebhookServer(secret: string, port: number) {
  const listeners = new Map<string, (event: WebhookEvent) => void>();

  const server = Bun.serve({
    port,
    async fetch(req) {
      if (req.method !== "POST") return new Response("OK", { status: 200 });

      const rawBody = await req.text();
      let event: WebhookEvent;
      try {
        // Signature scheme mirrors internal/webhook/signer.go (HMAC id.ts.body).
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

// ── Main ────────────────────────────────────────────
async function main() {
  header("1. Create Product");

  const product = await infi.products.create({
    name: "AI Agent Pro",
    type: "agent",
    pricingModel: "usage",
    currency: CURRENCY,
    description: "GPT-powered assistant with token-based billing",
  });
  console.log(`Product created: ${product.id} (${product.name})`);

  // ── Create Meters + Prices ────────────────────────
  header("2. Create Meters + Prices");
  // In this model a meter is the metric; the price lives on a published version
  // (immutable pricing history), so we create meters then publish a version.

  const tokenMeter = await infi.products.meters.create(product.id!, {
    name: "tokens",
    displayName: "AI Tokens",
    unit: "token",
    aggregation: "sum",
  });
  console.log(`Meter created: ${tokenMeter.id} (${tokenMeter.displayName})`);

  const requestMeter = await infi.products.meters.create(product.id!, {
    name: "requests",
    displayName: "API Requests",
    unit: "request",
    aggregation: "count",
  });
  console.log(`Meter created: ${requestMeter.id} (${requestMeter.displayName})`);

  const version = await infi.products.versions.create(product.id!, {});
  await infi.products.prices.add(product.id!, version.id!, {
    model: "per_unit",
    unitAmount: TOKEN_PRICE,
    currency: CURRENCY,
    meterId: tokenMeter.id,
  });
  await infi.products.prices.add(product.id!, version.id!, {
    model: "per_unit",
    unitAmount: REQUEST_PRICE,
    currency: CURRENCY,
    meterId: requestMeter.id,
  });
  await infi.products.versions.publish(product.id!, version.id!);
  console.log(`Prices published: ${TOKEN_PRICE}/token, ${REQUEST_PRICE}/request (${CURRENCY})`);

  // ── Register Customer ─────────────────────────────
  header("3. Register Customer");

  const enrollment = await infi.products.enroll(product.id!, {
    externalId: "customer_001",
    name: "Acme Corp",
    email: CUSTOMER_EMAIL,
  });
  const customerId = enrollment.id!;
  console.log(`Customer registered: ${enrollment.externalId} (${enrollment.name})`);
  console.log(`Invoice will be sent to: ${CUSTOMER_EMAIL}`);

  // ── Start Webhook Listener ────────────────────────
  header("4. Start Webhook Listener");

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
  console.log(`Webhook registered: ${webhook.id}`);

  const { server, waitForEvent } = startWebhookServer(webhook.secret, WEBHOOK_PORT);
  webhookServer = server;
  console.log(`Webhook server listening on port ${WEBHOOK_PORT}`);

  // ── AI Agent Usage (real calls) ──────────────────
  header("5. AI Agent Usage");
  const windowStart = new Date().toISOString();

  const prompts = [
    { prompt: "Summarize the benefits of serverless architecture in 2 sentences.", model: openai("gpt-4o-mini"), label: "gpt-4o-mini" },
    { prompt: "Write a one-paragraph marketing copy for a fintech API platform.", model: google("gemini-2.0-flash"), label: "gemini-2.0-flash" },
    { prompt: 'Translate to Portuguese: "Usage-based billing lets you pay only for what you use."', model: openai("gpt-4o-mini"), label: "gpt-4o-mini" },
    { prompt: "Explain the difference between REST and GraphQL in 3 bullet points.", model: google("gemini-2.0-flash"), label: "gemini-2.0-flash" },
    { prompt: "What is the capital of Brazil?", model: openai("gpt-4o-mini"), label: "gpt-4o-mini" },
  ];

  const session = infi.session(customerId);
  let totalTokens = 0;

  for (const { prompt, model, label } of prompts) {
    console.log(`\n  -> [${label}] "${prompt}"`);
    const result = await generateText({ model, prompt });
    const tokens = result.usage.totalTokens ?? 0;
    totalTokens += tokens;
    console.log(`     Response (${tokens} tokens): ${result.text.slice(0, 120).replace(/\n/g, " ")}...`);
    session.track("tokens", tokens, { model: label });
    session.track("requests", 1, { model: label });
  }

  await session.flush(); // one batch → POST /metering/events/batch
  console.log(`\nBatch sent: ${prompts.length * 2} events`);
  console.log(`Total tokens used: ${totalTokens}`);

  // ── Check Usage ───────────────────────────────────
  header("6. Check Usage");

  const usage = await infi.usage.get({ customerId, from: windowStart, to: new Date().toISOString() });
  let totalCost = 0;
  for (const m of usage.meters) {
    const amount = Number(m.totalAmount ?? 0);
    totalCost += amount;
    console.log(`  ${m.meter}: ${m.totalValue} ${m.unit}s = ${CURRENCY} ${amount.toFixed(2)}`);
  }
  console.log(`\n  Total: ${CURRENCY} ${totalCost.toFixed(2)}`);

  // ── Generate Invoice ──────────────────────────────
  header("7. Generate Invoice");
  const to = new Date().toISOString();
  console.log(`Period: ${windowStart.split("T")[0]} to ${to.split("T")[0]}`);

  const invoice = await infi.invoices.fromUsage({ customerId, from: windowStart, to });
  console.log(`Invoice created: ${invoice.invoiceNumber ?? invoice.id}`);
  console.log(`  Status: ${invoice.status}`);
  console.log(`  Total: ${invoice.currency} ${invoice.total}`);

  // ── Wait for Webhook ─────────────────────────────
  header("8. Wait for invoice.finalized Webhook");
  try {
    const event = await waitForEvent("invoice.finalized", 30_000);
    console.log("Webhook received! Payload:");
    console.log(JSON.stringify(event.data, null, 2));
  } catch {
    console.log("Timeout: invoice.finalized webhook not received within 30s (continuing anyway)");
  }

  // ── Send Invoice Email ────────────────────────────
  header("9. Send Invoice Email");
  await infi.invoices.send(invoice.id!);
  console.log(`Invoice email sent to ${CUSTOMER_EMAIL} (hosted pay link included)`);

  // ── Wait for Payment ────────────────────────────
  header("10. Wait for payment.confirmed Webhook");
  console.log("Waiting for customer to pay the invoice...");
  try {
    const event = await waitForEvent("payment.confirmed", 300_000);
    const data = event.data as PaymentConfirmedData;
    console.log(`Payment confirmed! ${data.amount} ${data.currency} (payment ${data.paymentId})`);
  } catch {
    console.log("Timeout: payment.confirmed webhook not received within 5min (continuing anyway)");
  }

  // ── Cleanup ─────────────────────────────────────
  header("11. Cleanup");
  await infi.webhooks.delete(webhook.id);
  console.log(`Webhook deleted: ${webhook.id}`);
  server.stop();
  console.log("Webhook server stopped");
  await ngrok.disconnect();
  console.log("Tunnel closed");

  // ── Done ──────────────────────────────────────────
  header("Done!");
  console.log(`
Summary:
  Product:    ${product.name} (${product.id})
  Customer:   ${enrollment.name} <${CUSTOMER_EMAIL}>
  Usage:      ${prompts.length} AI interactions
  Tokens:     ${totalTokens} total
  Invoice:    ${invoice.invoiceNumber ?? invoice.id} — ${invoice.currency} ${invoice.total}
  Webhook:    Received & cleaned up
`);
}

// ── Graceful shutdown ──────────────────────────────
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

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

main().catch(async (err) => {
  console.error("Script failed:", err);
  await cleanup();
  process.exit(1);
});
