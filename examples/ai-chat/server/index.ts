import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamText, convertToCoreMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildHostedLoginUrl } from "@beinfi/sdk";
import { infi, SLUG, APP_URL, STARTER_CREDITS, PACK_CREDITS, aiChatProductId } from "./infi.js";
import { prisma } from "./db.js";

const app = new Hono();
const SESSION_COOKIE = "infi_session";

/** Resolve the signed-in customer → their ai-chat enrollment (credit wallet),
 *  enrolling + granting starter credits on first sight. Null if not logged in. */
async function currentEnrollment(token: string | undefined): Promise<{ enrollmentId: string; customerId: string; email?: string } | null> {
  if (!token) return null;
  let session;
  try {
    session = await infi.getSession(token);
  } catch {
    return null;
  }
  const customerId = session.customer?.id;
  if (!customerId) return null;
  const email = session.customer?.email ?? session.identity?.email ?? undefined;

  const existing = await prisma.wallet.findUnique({ where: { customerId } });
  if (existing) return { enrollmentId: existing.enrollmentId, customerId, email: email ?? undefined };

  const productId = await aiChatProductId();
  const enrollment = await infi.products.enroll(productId, { externalId: customerId, email });
  await infi.customers.credits
    .grant(enrollment.id!, { amount: STARTER_CREDITS, reference: "starter" })
    .catch(() => {});
  await prisma.wallet.create({ data: { customerId, enrollmentId: enrollment.id!, granted: true } });
  return { enrollmentId: enrollment.id!, customerId, email: email ?? undefined };
}

// ── Auth ──────────────────────────────────────────────────────────────────
app.get("/api/auth/login", (c) => {
  const url = buildHostedLoginUrl({
    slug: SLUG,
    redirectTo: `${APP_URL}/callback`,
    authBaseUrl: process.env.INFI_AUTH_BASE_URL,
  });
  return c.redirect(url);
});

app.get("/callback", async (c) => {
  try {
    const result = await infi.exchangeCodeFromRequest({ url: c.req.url });
    if (result.session?.token) {
      setCookie(c, SESSION_COOKIE, result.session.token, {
        httpOnly: true,
        path: "/",
        sameSite: "Lax",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
  } catch {
    // fall through to redirect; the SPA will show the login screen
  }
  return c.redirect(APP_URL);
});

// ── Credits ─────────────────────────────────────────────────────────────────
app.get("/api/credits", async (c) => {
  const w = await currentEnrollment(getCookie(c, SESSION_COOKIE));
  if (!w) return c.json({ error: "unauthorized" }, 401);
  const summary = await infi.customers.credits.balance(w.enrollmentId);
  return c.json({ balance: summary.balance });
});

// ── Chat (stream) + consume ───────────────────────────────────────────────
app.post("/api/chat", async (c) => {
  const w = await currentEnrollment(getCookie(c, SESSION_COOKIE));
  if (!w) return c.json({ error: "unauthorized" }, 401);

  const summary = await infi.customers.credits.balance(w.enrollmentId);
  if (Number(summary.balance) <= 0) return c.json({ error: "out_of_credits" }, 402);

  const { messages } = (await c.req.json()) as { messages: Parameters<typeof convertToCoreMessages>[0] };

  const result = streamText({
    model: anthropic("claude-3-5-haiku-latest"),
    messages: convertToCoreMessages(messages),
    onFinish: async ({ usage }) => {
      const tokens = String(usage.totalTokens ?? 0);
      // Meter (analytics) + deduct credits. Fire-and-forget; never block the reply.
      infi.track({ customerId: w.enrollmentId, meter: "tokens", value: tokens }).catch(() => {});
      infi.customers.credits.consume(w.enrollmentId, { amount: tokens, reference: "chat" }).catch(() => {});
    },
  });

  return result.toDataStreamResponse();
});

// ── Buy a credit pack ───────────────────────────────────────────────────────
app.post("/api/checkout", async (c) => {
  const w = await currentEnrollment(getCookie(c, SESSION_COOKIE));
  if (!w) return c.json({ error: "unauthorized" }, 401);

  const productId = await aiChatProductId();
  const { invoice, url } = await infi.checkout({
    slug: SLUG,
    productId,
    customer: { externalId: w.customerId, email: w.email },
    successUrl: APP_URL,
  });
  if (invoice.id) {
    await prisma.purchase.upsert({
      where: { invoiceId: invoice.id },
      create: { invoiceId: invoice.id, enrollmentId: w.enrollmentId },
      update: {},
    });
  }
  return c.json({ url });
});

// ── Webhook: grant credits on payment.confirmed ─────────────────────────────
app.post("/api/webhooks/infi", async (c) => {
  const body = await c.req.text();
  let event;
  try {
    event = infi.verifyWebhook(
      {
        id: c.req.header("x-webhook-id") ?? "",
        eventType: c.req.header("x-webhook-event-type") ?? "",
        timestamp: c.req.header("x-webhook-timestamp") ?? "",
        signature: c.req.header("x-webhook-signature") ?? "",
        body,
      },
      process.env.INFI_WEBHOOK_SECRET!,
    );
  } catch {
    return c.json({ error: "invalid signature" }, 400);
  }
  if (event.type === "payment.confirmed") {
    const data = event.data as { invoiceId?: string };
    if (data.invoiceId) {
      const purchase = await prisma.purchase.findUnique({ where: { invoiceId: data.invoiceId } });
      if (purchase) {
        await infi.customers.credits
          .grant(purchase.enrollmentId, { amount: PACK_CREDITS, reference: data.invoiceId })
          .catch(() => {});
      }
    }
  }
  return c.json({ received: true });
});

serve({ fetch: app.fetch, port: 3012 });
console.log("AI chat API on http://localhost:3012");
