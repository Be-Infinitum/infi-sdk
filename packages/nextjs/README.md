# @beinfi/nextjs

Drop-in Next.js App Router handlers for Infi. Each block is one line — export it from a route and the
capability is wired.

```bash
npm install @beinfi/nextjs @beinfi/sdk
```

Env:

```bash
INFI_SECRET_KEY=sk_test_...      # server-side secret key
INFI_APP_SLUG=your-app           # app slug the hosted login is scoped to
# optional
INFI_API_URL=https://api.beinfi.com
INFI_AUTH_BASE_URL=https://auth.beinfi.com
```

## Auth

Redirect to the hosted login:

```ts
// app/api/auth/login/route.ts
import { Login } from "@beinfi/nextjs";

export const GET = Login({
  slug: process.env.INFI_APP_SLUG!,
  redirectTo: "/api/auth/callback",
});
```

Exchange the returned code for a session and set the cookie:

```ts
// app/api/auth/callback/route.ts
import { Callback } from "@beinfi/nextjs";

export const GET = Callback({
  secretKey: process.env.INFI_SECRET_KEY!,
  successUrl: "/dashboard",
});
```

Read the session anywhere on the server:

```ts
import { getSessionToken } from "@beinfi/nextjs";

const token = await getSessionToken();
if (!token) redirect("/api/auth/login");
```

## Usage metering

Ingest events server-side (single event or `{ events: [...] }`). Never ingest from the browser.

```ts
// app/api/usage/route.ts
import { Usage } from "@beinfi/nextjs";

export const POST = Usage({
  secretKey: process.env.INFI_SECRET_KEY!,
  // stamp the authed customer onto every event
  resolveCustomerId: async (req) => (await getSessionCustomer(req)).id,
});
```

## Metered LLM routes

Gate a credit-consuming route: `withMeter` checks the customer's credit, runs your handler,
records its usage, and returns the handler's data as JSON. Out of credit → `402` **before** the
handler runs (never do the work for free); unresolved customer → `400`. Server-side only.

Your handler returns the JSON-serializable result (e.g. the model response); `withMeter`
auto-detects the token usage from it (OpenAI/Anthropic/AI-SDK shapes, or set `value`/`extract`).
The resolved id is passed to your handler as the second arg (`{ customerId }`) so you don't
re-resolve the session.

```ts
// app/api/chat/route.ts
import { withMeter } from "@beinfi/nextjs";

export const POST = withMeter(
  {
    secretKey: process.env.INFI_SECRET_KEY!,
    meter: "tokens",
    resolveCustomerId: async (req) => (await getSessionCustomer(req)).id,
  },
  async (req, { customerId }) => {
    const { messages } = await req.json();
    return openai.chat.completions.create({ model: "gpt-4o", messages });
  },
);
```

`mode` selects the billing behavior (default `"prepaid"` = gate + record): `"postpaid"` records
without gating (metered API / rate-card — replaces `skipGuard`), `"streaming"` gates but
doesn't record (record later yourself). Flat/per-unit metering: set `value: 1`.

**Return a `Response` or throw `MeterAbort`.** If your handler returns a `Response`/`NextResponse`
it is passed through untouched (usage recorded only on 2xx, and only when `value`/`extract` is set
— an opaque/streamed body can't be auto-detected). For a business error (bad input), throw
`new MeterAbort(status, body)` — `withMeter` returns `NextResponse.json(body, { status })` and
records **nothing**, so validation failures stop surfacing as generic 500s.

## Metering outside a route (Server Actions)

`withMeter` wraps a route handler. For a Next.js **Server Action** (or any non-route code), use
`meterAction` (wraps the action — gates, runs, records, returns the action's plain value) or the
bare `guardCredit` gate:

```ts
"use server";
import { meterAction, guardCredit } from "@beinfi/nextjs";

// wrap the whole action
export const createLead = meterAction(
  { secretKey: process.env.INFI_SECRET_KEY!, meter: "leads", value: 1, mode: "postpaid",
    customerId: /* resolved from the session */ enrollmentId },
  async (input: LeadInput) => db.lead.create({ data: input }),
);

// or just gate at the top of an existing action
export async function generate(input: Input) {
  await guardCredit({ secretKey: process.env.INFI_SECRET_KEY!, customerId: enrollmentId });
  // ...do the work
}
```

## Customer state route

`State` mirrors `Usage` — a drop-in `GET` that returns `infi.customers.state(id)` as JSON, so a
client (or a non-Next app) can read a customer's balance/usage without hand-rolling a proxy:

```ts
// app/api/state/route.ts
import { State } from "@beinfi/nextjs";

export const GET = State({
  secretKey: process.env.INFI_SECRET_KEY!,
  resolveCustomerId: async (req) => (await getSessionCustomer(req)).id,
});
```

## Options

`Login` — `slug`, `redirectTo` (relative resolved against the request origin), `authBaseUrl?`,
`state?` (string or `(req) => string`).

`Callback` — `secretKey`, `successUrl`, `baseUrl?`, `sessionMode?` (`"infi" | "byo"`), `cookie?`
(`{ maxAgeSeconds, secure, path }`), `onAuth?` (return a `NextResponse` to take over), `onError?`.

`Usage` — `secretKey`, `baseUrl?`, `resolveCustomerId?`.

`State` — `secretKey`, `baseUrl?`, `resolveCustomerId`.

`withMeter` — `secretKey`, `meter`, `resolveCustomerId`, `mode?` (`"prepaid" | "postpaid" |
"streaming"`), `value?`, `extract?`, `skipGuard?` (deprecated → `mode`), `metadata?`,
`baseUrl?`, `onMissingCustomer?` (default `400`), `onInsufficientCredit?` (default `402`).
Handler receives `(req, { customerId })`; return a `Response` to pass through, throw
`MeterAbort(status, body)` for business errors.

`meterAction` — `secretKey`, `customerId`, `meter`, `mode?`, `value?`, `extract?`, `metadata?`,
`baseUrl?`. `guardCredit` — `{ secretKey, customerId, baseUrl? }`.
