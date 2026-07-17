/**
 * @beinfi/sdk — AI Agent Billing (end-to-end, sandbox)
 *
 * Everything runs through the SDK:
 *   1. Declare a product + meters as code and sync it
 *   2. Enroll a customer
 *   3. Open an ngrok tunnel + register a webhook endpoint (invoice + payment events)
 *   4. Make REAL AI calls (OpenAI + Gemini) and record token usage via infi.meter
 *   5. Read the usage, open an invoice, and email it (invoice.sent webhook)
 *   6. Wait for the customer to pay — payment.confirmed webhook closes the flow
 *
 * Run (bun):
 *   INFI_SECRET_KEY=sk_test_… \
 *   OPENAI_API_KEY=sk-… GOOGLE_GENERATIVE_AI_API_KEY=… \
 *   NGROK_AUTHTOKEN=… \
 *   bun run index.ts
 */
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import ngrok from "@ngrok/ngrok";
import { generateText } from "ai";
import {
  Infi,
  InfiError,
  defineBilling,
  verifyWebhook,
  type PaymentConfirmedData,
  type WebhookEvent,
} from "@beinfi/sdk";

// ── Config (sandbox) ─────────────────────────────────────────────────────────
// Never hardcode keys — pass them via env (sandbox test keys are fine there).
const SECRET_KEY = process.env.INFI_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("Set INFI_SECRET_KEY (sk_test_…) — see README.");
  process.exit(1);
}
// Publishable key — the browser/pay-page key; server calls here use the secret key.
const PUBLISHABLE_KEY = process.env.INFI_PUBLISHABLE_KEY ?? "(pk_test_… — set INFI_PUBLISHABLE_KEY)";
const API_URL = process.env.INFI_API_URL ?? "https://api-sandbox.beinfi.com";
const PAY_BASE = process.env.INFI_PAY_BASE_URL ?? "https://app.beinfi.com";
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT ?? "9876");
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL ?? "demo@example.com";

const TOKEN_PRICE = "0.0001"; // BRL per token
const REQUEST_PRICE = "0.005"; // BRL per request
const CURRENCY = "BRL";

const infi = new Infi({ secretKey: SECRET_KEY, baseUrl: API_URL, payBaseUrl: PAY_BASE });

function header(text: string) {
  console.log(`\n${"=".repeat(52)}\n  ${text}\n${"=".repeat(52)}`);
}

// ── Webhook server (verifies the signature via the SDK) ──────────────────────
function startWebhookServer(secret: string, port: number) {
  const waiters = new Map<string, (e: WebhookEvent) => void>();

  const server = Bun.serve({
    port,
    async fetch(req) {
      if (req.method !== "POST") return new Response("ok");
      const body = await req.text();
      let event: WebhookEvent;
      try {
        event = verifyWebhook(
          {
            id: req.headers.get("x-webhook-id") ?? "",
            timestamp: req.headers.get("x-webhook-timestamp") ?? "",
            signature: req.headers.get("x-webhook-signature") ?? "",
            eventType: req.headers.get("x-webhook-event-type") ?? "",
            body,
          },
          secret,
        );
      } catch (err) {
        console.warn("  ! rejected webhook:", err instanceof Error ? err.message : err);
        return new Response("invalid signature", { status: 401 });
      }
      console.log(`  ← webhook ${event.type}`);
      waiters.get(event.type)?.(event);
      return new Response("ok");
    },
  });

  return {
    stop: () => server.stop(),
    waitFor(type: string, timeoutMs: number): Promise<WebhookEvent> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(type);
          reject(new Error(`timeout waiting for ${type}`));
        }, timeoutMs);
        waiters.set(type, (e) => {
          clearTimeout(timer);
          waiters.delete(type);
          resolve(e);
        });
      });
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
let tunnel: ngrok.Listener | null = null;
let webhookId: string | undefined;
let webhookServer: { stop: () => void } | null = null;

async function main() {
  console.log(`Beinfi AI-agent billing → ${API_URL}`);
  console.log(`(publishable key ${PUBLISHABLE_KEY.slice(0, 12)}… is the browser/pay key)`);

  // 1) Product + meters as code, synced idempotently.
  header("1. Product");
  const sync = await infi.sync(
    defineBilling({
      products: [
        {
          key: "ai-agent",
          name: "AI Agent Pro",
          type: "agent",
          pricingModel: "usage",
          currency: CURRENCY,
          meters: [
            { key: "tokens", displayName: "AI Tokens", unit: "token", aggregation: "sum" },
            { key: "requests", displayName: "API Requests", unit: "request", aggregation: "count" },
          ],
          prices: [
            { meter: "tokens", model: "per_unit", unitAmount: TOKEN_PRICE },
            { meter: "requests", model: "per_unit", unitAmount: REQUEST_PRICE },
          ],
        },
      ],
    }),
  );
  console.log(`  ${sync.actions.map((a) => `${a.action} ${a.resource}`).join(", ")}`);
  const product = (await infi.products.list()).find((p) => p.key === "ai-agent");
  if (!product?.id) throw new Error("product not found after sync");
  console.log(`  product ${product.id}`);

  // 2) Customer.
  header("2. Customer");
  const enrollment = await infi.products.enroll(product.id, {
    externalId: `customer_${Date.now()}`,
    name: "Acme Corp",
    email: CUSTOMER_EMAIL,
  });
  const customerId = enrollment.id!;
  console.log(`  enrolled ${enrollment.name} (${customerId}) — invoice to ${CUSTOMER_EMAIL}`);

  // 3) Tunnel + webhook endpoint.
  header("3. Webhook");
  tunnel = await ngrok.forward({ addr: WEBHOOK_PORT, authtoken_from_env: true });
  const tunnelUrl = tunnel.url()!;
  const endpoint = await infi.webhooks.create({
    url: tunnelUrl,
    events: ["invoice.sent", "invoice.finalized", "payment.confirmed", "payment.failed"],
  });
  webhookId = endpoint.id;
  const secret = endpoint.secret;
  if (!secret) throw new Error("webhook endpoint returned no signing secret");
  webhookServer = startWebhookServer(secret, WEBHOOK_PORT);
  console.log(`  ${tunnelUrl} → :${WEBHOOK_PORT}  (endpoint ${endpoint.id})`);

  // 4) Real AI calls — record each turn's usage in a batching session.
  header("4. AI usage");
  const from = new Date().toISOString(); // usage window opens here
  const calls = [
    { label: "gpt-4o-mini", model: openai("gpt-4o-mini"), prompt: "Resuma serverless em 2 frases." },
    { label: "gemini-2.0-flash", model: google("gemini-2.0-flash"), prompt: "Escreva um slogan para uma API fintech." },
    { label: "gpt-4o-mini", model: openai("gpt-4o-mini"), prompt: 'Traduza para inglês: "cobrança por uso".' },
    { label: "gemini-2.0-flash", model: google("gemini-2.0-flash"), prompt: "REST vs GraphQL em 3 bullets." },
  ];
  const usageSession = infi.session(customerId);
  let totalTokens = 0;
  for (const { label, model, prompt } of calls) {
    const res = await generateText({ model, prompt });
    const tokens = res.usage.totalTokens ?? 0;
    totalTokens += tokens;
    usageSession.track("tokens", tokens, { model: label }).track("requests", 1, { model: label });
    console.log(`  · [${label}] ${tokens} tokens — ${res.text.slice(0, 60).replace(/\n/g, " ")}…`);
  }
  await usageSession.flush(); // one batch → POST /metering/events/batch
  console.log(`  flushed ${totalTokens} tokens over ${calls.length} requests`);

  // 5) Invoice — the platform rolls the accrued usage into one, rated + emailed.
  header("5. Invoice");
  const to = new Date().toISOString();
  const invoice = await infi.invoices.fromUsage({ customerId, from, to, send: true });
  console.log(`  invoice ${invoice.id} • ${invoice.total} ${invoice.currency} • status ${invoice.status}`);
  console.log(`  emailed to ${CUSTOMER_EMAIL}`);

  try {
    await webhookServer!.waitFor("invoice.sent", 30_000);
  } catch {
    console.log("  (invoice.sent webhook not seen in 30s — continuing)");
  }

  // 6) Wait for the customer to pay — payment.confirmed closes the flow.
  header("6. Awaiting payment");
  console.log("  customer pays via the emailed link… (up to 5 min)");
  try {
    const paid = (await webhookServer!.waitFor("payment.confirmed", 300_000)) as WebhookEvent<PaymentConfirmedData>;
    console.log(`\n✓ PAID — payment ${paid.data.paymentId} • ${paid.data.amount} ${paid.data.currency}`);
  } catch {
    console.log(`\n… no payment.confirmed within 5 min. Invoice ${invoice.id} is still open.`);
  }

  header("Summary");
  console.log(`  product   ${product.name}`);
  console.log(`  customer  Acme Corp <${CUSTOMER_EMAIL}>`);
  console.log(`  usage     ${totalTokens} tokens over ${calls.length} requests`);
  console.log(`  invoice   ${invoice.id} — ${invoice.total} ${invoice.currency}`);
}

async function cleanup() {
  console.log("\ncleaning up…");
  try {
    if (webhookId) await infi.webhooks.delete(webhookId);
  } catch { /* best effort */ }
  webhookServer?.stop();
  if (tunnel) await ngrok.disconnect();
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

main()
  .then(cleanup)
  .catch(async (err) => {
    if (err instanceof InfiError) console.error(`\n✗ InfiError [${err.status} ${err.code}]: ${err.message}`);
    else console.error("\n✗", err);
    await cleanup();
    process.exit(1);
  });
