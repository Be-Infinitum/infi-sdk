/**
 * @beinfi/sdk — AI Agent Billing Demo
 *
 * End-to-end AI agent billing demo:
 * 1. `infi.sync(infi.billing.ts)` — company as code (product + meters + prices)
 * 2. Registers a customer, makes real AI calls, tracks usage
 * 3. Generates invoice; optional ngrok webhooks for payment.confirmed
 *
 * Usage:
 *   INFI_SECRET_KEY=sk_test_xxx OPENAI_API_KEY=sk-xxx \
 *     GOOGLE_GENERATIVE_AI_API_KEY=xxx bun run index.ts
 *
 * Optional: NGROK_AUTHTOKEN for live webhook waits.
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
import billing, { PRODUCT_KEY, CURRENCY } from "./infi.billing.js";

// The Vercel AI SDK's Google provider reads GOOGLE_GENERATIVE_AI_API_KEY;
// accept GEMINI_API_KEY as a friendlier alias.
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

const API_KEY = process.env.INFI_SECRET_KEY;
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || "9876", 10);
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || "demo@example.com";

if (!API_KEY) {
  console.error("Set INFI_SECRET_KEY env var (e.g. sk_test_xxx)");
  process.exit(1);
}

// Mode inferred from key prefix — sk_test_ → sandbox. Override host only for local:
// `new Infi({ secretKey: API_KEY, apiUrl: process.env.INFI_API_URL })`
const infi = new Infi({
  secretKey: API_KEY,
  ...(process.env.INFI_API_URL ? { apiUrl: process.env.INFI_API_URL } : {}),
});

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
  header("1. Sync company (defineCompany)");

  const sync = await infi.sync(billing);
  console.log(
    `Synced (${sync.actions.length} actions):`,
    sync.actions.map((a) => `${a.action}:${a.resource}`).join(", ") || "none",
  );

  const product = (await infi.products.list()).find((p) => p.key === PRODUCT_KEY);
  if (!product?.id) throw new Error(`Product ${PRODUCT_KEY} not found after sync`);
  console.log(`Product: ${product.id} (${product.name})`);

  header("2. Register Customer");

  const enrollment = await infi.products.enroll(product.id, {
    externalId: "customer_001",
    name: "Acme Corp",
    email: CUSTOMER_EMAIL,
  });
  const customerId = enrollment.id!;
  console.log(`Customer registered: ${enrollment.externalId} (${enrollment.name})`);
  console.log(`Invoice will be sent to: ${CUSTOMER_EMAIL}`);

  header("3. Start Webhook Listener");

  // Webhooks are optional: they need an ngrok tunnel (NGROK_AUTHTOKEN). Without
  // it, the demo still runs the full billing flow and just skips the live waits.
  let waitForEvent: ((type: string, ms?: number) => Promise<WebhookEvent>) | null = null;
  if (process.env.NGROK_AUTHTOKEN) {
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

    const started = startWebhookServer(webhook.secret, WEBHOOK_PORT);
    webhookServer = started.server;
    waitForEvent = started.waitForEvent;
    console.log(`Webhook server listening on port ${WEBHOOK_PORT}`);
  } else {
    console.log("NGROK_AUTHTOKEN not set — skipping webhooks (billing flow still runs).");
  }

  header("4. AI Agent Usage");
  const windowStart = new Date().toISOString();

  const prompts = [
    {
      prompt: "Summarize the benefits of serverless architecture in 2 sentences.",
      model: openai("gpt-4o-mini"),
      label: "gpt-4o-mini",
    },
    {
      prompt: "Write a one-paragraph marketing copy for a fintech API platform.",
      model: google("gemini-2.0-flash"),
      label: "gemini-2.0-flash",
    },
    {
      prompt: 'Translate to Portuguese: "Usage-based billing lets you pay only for what you use."',
      model: openai("gpt-4o-mini"),
      label: "gpt-4o-mini",
    },
    {
      prompt: "Explain the difference between REST and GraphQL in 3 bullet points.",
      model: google("gemini-2.0-flash"),
      label: "gemini-2.0-flash",
    },
    {
      prompt: "What is the capital of Brazil?",
      model: openai("gpt-4o-mini"),
      label: "gpt-4o-mini",
    },
  ];

  // productId is required by metering ingest — session stamps it on every event.
  const session = infi.session(customerId, product.id);
  let totalTokens = 0;

  for (const { prompt, model, label } of prompts) {
    console.log(`\n  -> [${label}] "${prompt}"`);
    let result;
    try {
      result = await generateText({ model, prompt });
    } catch (err) {
      // A provider error (quota, key) shouldn't kill the demo — skip this call.
      console.log(
        `     skipped (${label}): ${err instanceof Error ? err.message.split("\n")[0] : err}`,
      );
      continue;
    }
    const tokens = result.usage.totalTokens ?? 0;
    totalTokens += tokens;
    console.log(
      `     Response (${tokens} tokens): ${result.text.slice(0, 120).replace(/\n/g, " ")}...`,
    );
    session.track("tokens", tokens, { model: label });
    session.track("requests", 1, { model: label });
  }

  const eventCount = session.size;
  await session.flush();
  console.log(`\nBatch sent: ${eventCount} events`);
  console.log(`Total tokens used: ${totalTokens}`);

  header("5. Check Usage");

  const usage = await infi.usage.get({
    customerId,
    from: windowStart,
    to: new Date().toISOString(),
  });
  let totalCost = 0;
  for (const m of usage.meters) {
    const amount = Number(m.totalAmount ?? 0);
    totalCost += amount;
    console.log(`  ${m.meter}: ${m.totalValue} ${m.unit}s = ${CURRENCY} ${amount.toFixed(2)}`);
  }
  console.log(`\n  Total: ${CURRENCY} ${totalCost.toFixed(2)}`);

  header("6. Generate Invoice");
  const to = new Date().toISOString();
  console.log(`Period: ${windowStart.split("T")[0]} to ${to.split("T")[0]}`);

  const invoice = await infi.invoices.fromUsage({
    customerId,
    from: windowStart,
    to,
  });
  console.log(`Invoice created: ${invoice.invoiceNumber ?? invoice.id}`);
  console.log(`  Status: ${invoice.status}`);
  console.log(`  Total: ${invoice.currency} ${invoice.total}`);

  header("7. Wait for invoice.finalized Webhook");
  if (waitForEvent) {
    try {
      const event = await waitForEvent("invoice.finalized", 30_000);
      console.log("Webhook received! Payload:");
      console.log(JSON.stringify(event.data, null, 2));
    } catch {
      console.log("Timeout: invoice.finalized webhook not received within 30s (continuing anyway)");
    }
  } else {
    console.log("(webhooks disabled)");
  }

  header("8. Send Invoice Email");
  await infi.invoices.send(invoice.id!);
  console.log(`Invoice email sent to ${CUSTOMER_EMAIL} (hosted pay link included)`);

  header("9. Wait for payment.confirmed Webhook");
  if (waitForEvent) {
    console.log("Waiting for customer to pay the invoice...");
    try {
      const event = await waitForEvent("payment.confirmed", 300_000);
      const data = event.data as PaymentConfirmedData;
      console.log(
        `Payment confirmed! ${data.amount} ${data.currency} (payment ${data.paymentId})`,
      );
    } catch {
      console.log("Timeout: payment.confirmed webhook not received within 5min (continuing anyway)");
    }
  } else {
    console.log("(webhooks disabled — customer pays via the emailed link)");
  }

  header("10. Cleanup");
  if (webhookId) {
    await infi.webhooks.delete(webhookId);
    console.log(`Webhook deleted: ${webhookId}`);
  }
  webhookServer?.stop();
  if (activeTunnel) {
    await ngrok.disconnect();
    console.log("Tunnel closed");
  }

  header("Done!");
  console.log(`
Summary:
  Product:    ${product.name} (${product.id})
  Customer:   ${enrollment.name} <${CUSTOMER_EMAIL}>
  Usage:      ${eventCount / 2} billed AI calls (${totalTokens} tokens)
  Invoice:    ${invoice.invoiceNumber ?? invoice.id} — ${invoice.currency} ${invoice.total}
  Webhooks:   ${waitForEvent ? "received & cleaned up" : "disabled (no NGROK_AUTHTOKEN)"}
`);
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
