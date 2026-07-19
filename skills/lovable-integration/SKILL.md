# Skill — Lovable + Infi integration

**When:** Building or extending a [Lovable](https://lovable.dev) app that needs Infi auth,
prepaid credits, checkout, or usage metering.

**Stack assumption:** Lovable → React/Vite frontend + **Supabase Edge Functions** for server
routes (secret key never in the browser).

**Reference example:** `examples/ai-chat` (same flows, Hono instead of Deno — copy the logic).

---

## Copy-paste prompt for Lovable chat

```
Integrate Beinfi billing into this Lovable app. Follow these rules exactly:

SETUP (do first)
1. Run once (local/CI): npx @beinfi/cli bootstrap --intent prepaid-ai-chat --ref lovable --app-url https://YOUR.lovable.app --json
2. Add env secrets from bootstrap env: INFI_SECRET_KEY, INFI_SLUG, APP_URL. Do NOT set AUTH/PAY URLs.
3. Optional: INFI_WEBHOOK_SECRET after webhook registration

DEPENDENCIES
- @beinfi/sdk, @beinfi/auth (server/edge only for auth helpers)

SUPABASE EDGE FUNCTIONS (use @beinfi/auth — Web Request/Response)
- auth-login   → createLoginHandler({ slug, redirectTo: APP_URL/callback, authBaseUrl: INFI_AUTH_BASE_URL })
- auth-callback → createCallbackHandler({ secretKey, successUrl: APP_URL })
- api-state    → createStateHandler({ secretKey, resolveCustomerId from session.customer.id })
- api-chat     → infi.meter({ customerId: enrollmentId, meter: "tokens", mode: "streaming" }, streamText)
- api-checkout → infi.checkout({ slug, productId, customer })
- webhooks-infi → infi.verifyWebhook + credits.grant on payment.confirmed

FRONTEND (React, no secret key)
- Login link: href to auth-login function URL (or proxy /api/auth/login)
- UsagePanel: fetch api-state, pass JSON to <UsagePanel state={...} /> from @beinfi/sdk/react
- 402 on chat = show buy-credits button → api-checkout

CRITICAL
- enrollmentId (ProductCustomer.id) for credits/meter/state — NOT always same as session.customer.id;
  enroll on first login via infi.products.enroll(productId, { externalId, email })
- Auth codes expire in 60s — never reload old /callback tabs
- INFI_AUTH_BASE_URL is the Infi FRONTEND (login UI), NOT INFI_API_URL
- Without infi sync (products + apps), login succeeds but user bounces to login screen forever

See repo AGENTS.md and skills/lovable-integration/SKILL.md for full detail.
```

---

## Architecture

```
┌──────────────────┐     ┌─────────────────────────────┐     ┌─────────────┐
│ Lovable React    │     │ Supabase Edge Functions      │     │ Infi        │
│ (browser)        │     │ (INFI_SECRET_KEY here only)  │     │             │
├──────────────────┤     ├─────────────────────────────┤     ├─────────────┤
│ /login link  ────┼────►│ auth-login (@beinfi/auth)    │────►│ hosted login│
│ /callback    ◄───┼─────│ auth-callback                │◄────│ redirect    │
│ fetch state  ────┼────►│ api-state                    │────►│ customers   │
│ useChat      ────┼────►│ api-chat (meter streaming)   │────►│ credits     │
│ buy credits  ────┼────►│ api-checkout                 │────►│ checkout    │
└──────────────────┘     └─────────────────────────────┘     └─────────────┘

infi.billing.ts ──► npx infi sync (once, local/CI) ──► tenant catalog + app origins
```

---

## Step 1 — Provision tenant

Run **outside** Lovable (or in a local terminal):

```bash
npx @beinfi/cli claim create --ref lovable --json
```

Save from JSON:
- `apiKeySecret` → `INFI_SECRET_KEY`
- `claimUrl` → share with founder to claim tenant
- Pick a slug → `INFI_SLUG` (e.g. `my-lovable-app`)

---

## Step 2 — Environment secrets

Set in **Lovable project settings** and **Supabase Edge Function secrets**:

| Secret | Example | Notes |
|--------|---------|-------|
| `INFI_SECRET_KEY` | `sk_test_...` | Server only |
| `INFI_SLUG` | `my-lovable-app` | Must match `apps[].slug` in billing |
| `INFI_AUTH_BASE_URL` | `https://app.beinfi.com` | Login UI — **not** the API |
| `INFI_API_URL` | `https://api-sandbox.beinfi.com` | Optional (inferred from key) |
| `APP_URL` | `https://xyz.lovable.app` | Preview **and** prod URLs if both used |
| `INFI_WEBHOOK_SECRET` | `whsec_...` | For payment webhooks |
| `ANTHROPIC_API_KEY` / etc. | — | Your LLM provider |

If preview and production URLs differ, list **both** in `allowedOrigins` inside `infi.billing.ts`.

---

## Step 3 — `infi.billing.ts`

Create at repo root (TypeScript only — rest of app can stay as-is):

```ts
import { defineBilling } from "@beinfi/sdk";

const APP_URL = process.env.APP_URL ?? "https://YOUR-PROJECT.lovable.app";
const SLUG = process.env.INFI_SLUG ?? "my-lovable-app";

export default defineBilling({
  products: [
    {
      key: "ai-chat",
      name: "AI Chat",
      type: "agent",
      pricingModel: "prepaid",
      billingCycle: "monthly",
      currency: "BRL",
      basePrice: "19.90",
      meters: [{ key: "tokens", unit: "token", aggregation: "sum" }],
      prices: [{ meter: "tokens", model: "prepaid_credits", unitAmount: "0.01" }],
    },
  ],
  apps: [
    {
      slug: SLUG,
      name: "My Lovable App",
      allowedOrigins: [APP_URL, "http://localhost:5173"],
      redirectUris: [`${APP_URL}/callback`, "http://localhost:5173/callback"],
    },
  ],
  webhooks: [
    {
      url: `${APP_URL}/functions/v1/webhooks-infi`,
      events: ["payment.confirmed"],
    },
  ],
});
```

Apply (developer machine or CI — **before first login test**):

```bash
npm i -D @beinfi/cli @beinfi/sdk
INFI_SECRET_KEY=sk_test_... npx infi sync infi.billing.ts --plan
INFI_SECRET_KEY=sk_test_... npx infi sync infi.billing.ts
INFI_SECRET_KEY=sk_test_... INFI_SLUG=my-lovable-app npx infi doctor --json
```

Commit `infi.billing.lock.json` next to the config.

---

## Step 4 — Supabase Edge Functions

Install in functions workspace (or bundle via esm.sh in Deno):

```json
{ "dependencies": { "@beinfi/sdk": "^0.8.1", "@beinfi/auth": "^0.1.0" } }
```

### `supabase/functions/auth-login/index.ts`

```ts
import { createLoginHandler } from "npm:@beinfi/auth@0.1.0";

const handler = createLoginHandler({
  slug: Deno.env.get("INFI_SLUG")!,
  redirectTo: `${Deno.env.get("APP_URL")}/callback`,
  authBaseUrl: Deno.env.get("INFI_AUTH_BASE_URL")!,
});

Deno.serve((req) => handler(req));
```

### `supabase/functions/auth-callback/index.ts`

```ts
import { createCallbackHandler } from "npm:@beinfi/auth@0.1.0";

const handler = createCallbackHandler({
  secretKey: Deno.env.get("INFI_SECRET_KEY")!,
  apiUrl: Deno.env.get("INFI_API_URL"),
  successUrl: Deno.env.get("APP_URL")!,
});

Deno.serve((req) => handler(req));
```

### `supabase/functions/api-state/index.ts`

```ts
import { createStateHandler } from "npm:@beinfi/auth@0.1.0";

const handler = createStateHandler({
  secretKey: Deno.env.get("INFI_SECRET_KEY")!,
  apiUrl: Deno.env.get("INFI_API_URL"),
  // Pass enrollmentId if you store it after enroll(); else customer.id for simple cases
  resolveCustomerId: (_req, session) => session.customer?.id,
});

Deno.serve((req) => handler(req));
```

### `supabase/functions/api-chat/index.ts` (streaming + credits)

```ts
import { Infi, InsufficientCreditError } from "npm:@beinfi/sdk@0.8.1";
import { getSessionFromRequest } from "npm:@beinfi/auth@0.1.0";
import { streamText } from "npm:ai@4";
import { anthropic } from "npm:@ai-sdk/anthropic@1";

const infi = new Infi({
  secretKey: Deno.env.get("INFI_SECRET_KEY")!,
  apiUrl: Deno.env.get("INFI_API_URL"),
});

Deno.serve(async (req) => {
  const session = await getSessionFromRequest(req, {
    secretKey: Deno.env.get("INFI_SECRET_KEY")!,
  });
  if (!session?.customer?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // TODO: resolve enrollmentId from your DB (see enroll-on-first-login below)
  const enrollmentId = session.customer.id;

  const { messages } = await req.json();

  try {
    const result = await infi.meter(
      { customerId: enrollmentId, meter: "tokens", mode: "streaming" },
      () =>
        streamText({
          model: anthropic("claude-3-5-haiku-latest"),
          messages,
          onFinish: ({ usage }) => {
            infi.customers.credits
              .consume(enrollmentId, { amount: String(usage.totalTokens ?? 0), reference: "chat" })
              .catch(() => {});
          },
        }),
    );
    return result.toDataStreamResponse();
  } catch (err) {
    if (err instanceof InsufficientCreditError) {
      return Response.json({ error: "out_of_credits", balance: err.balance }, { status: 402 });
    }
    throw err;
  }
});
```

### Enroll on first login (wallet id)

After callback, or on first authenticated request, persist enrollment:

```ts
const product = (await infi.products.list()).find((p) => p.key === "ai-chat");
const enrollment = await infi.products.enroll(product!.id!, {
  externalId: session.customer!.id!,
  email: session.customer!.email,
});
await infi.customers.credits.grant(enrollment.id!, {
  amount: "2000",
  reference: "starter",
});
// Store enrollment.id in Supabase table keyed by customer id
```

---

## Step 5 — React frontend (Lovable)

```tsx
// src/components/LoginButton.tsx
const FN = import.meta.env.VITE_SUPABASE_URL;
export function LoginButton() {
  return (
    <a href={`${FN}/functions/v1/auth-login`} className="btn">
      Sign in
    </a>
  );
}
```

```tsx
// Usage — fetch state from edge function
import { UsagePanel } from "@beinfi/sdk/react";

const res = await fetch(`${SUPABASE_URL}/functions/v1/api-state`, { credentials: "include" });
const state = await res.json();
return <UsagePanel state={state} />;
```

Proxy alternative: configure Vite dev proxy `/api/*` → Supabase functions so URLs stay relative.

---

## Step 6 — Webhook (credit packs)

`supabase/functions/webhooks-infi/index.ts`:

```ts
import { Infi } from "npm:@beinfi/sdk@0.8.1";

const infi = new Infi({ secretKey: Deno.env.get("INFI_SECRET_KEY")! });

Deno.serve(async (req) => {
  const body = await req.text();
  const event = infi.verifyWebhook(
    {
      id: req.headers.get("x-webhook-id") ?? "",
      eventType: req.headers.get("x-webhook-event-type") ?? "",
      timestamp: req.headers.get("x-webhook-timestamp") ?? "",
      signature: req.headers.get("x-webhook-signature") ?? "",
      body,
    },
    Deno.env.get("INFI_WEBHOOK_SECRET")!,
  );

  if (event.type === "payment.confirmed") {
    const invoiceId = (event.data as { invoiceId?: string }).invoiceId;
    // Lookup enrollmentId by invoiceId in your purchases table, then:
    // await infi.customers.credits.grant(enrollmentId, { amount: "50000", reference: invoiceId });
  }

  return Response.json({ received: true });
});
```

Register webhook URL in dashboard or via `webhooks[]` in `infi.billing.ts` + sync.

---

## Checklist before shipping

- [ ] `infi claim create --ref lovable` done, secrets in Lovable + Supabase
- [ ] `infi sync infi.billing.ts` applied, lockfile committed
- [ ] `infi doctor --json` → `products` and `app` pass
- [ ] `APP_URL` matches live Lovable URL in `allowedOrigins`
- [ ] Login → callback → session cookie → `/api/state` returns JSON
- [ ] Chat deducts credits; 402 shows checkout when empty
- [ ] Webhook grants credits on pack purchase

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login OK but back to login screen | Zero products or no sync | `infi sync infi.billing.ts` |
| Redirect rejected | Wrong origin | Add Lovable URL to `apps[].allowedOrigins`, re-sync |
| 401 on all API routes | No session cookie / wrong domain | Check callback Set-Cookie, SameSite, APP_URL |
| Credits never decrease | Wrong id (customer vs enrollment) | Use enrollment id from `products.enroll` |
| Login 404 | Auth URL = API URL | Fix `INFI_AUTH_BASE_URL` |

Run: `INFI_SECRET_KEY=... INFI_SLUG=... npx infi doctor --json`

---

## Related

- [`AGENTS.md`](../../AGENTS.md) — full agent guide
- [`skills/add-prepaid-ai-chat/`](../add-prepaid-ai-chat/SKILL.md) — meter/streaming detail
- [`examples/ai-chat/`](../../examples/ai-chat/) — working Hono reference
- [`@beinfi/auth` README](../../packages/auth/README.md) — handler API
