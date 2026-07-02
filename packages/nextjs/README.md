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
auto-detects the token usage from it (OpenAI/Anthropic shapes, or set `value`/`extract`).

```ts
// app/api/chat/route.ts
import { withMeter } from "@beinfi/nextjs";

export const POST = withMeter(
  {
    secretKey: process.env.INFI_SECRET_KEY!,
    meter: "tokens",
    resolveCustomerId: async (req) => (await getSessionCustomer(req)).id,
  },
  async (req) => {
    const { messages } = await req.json();
    return openai.chat.completions.create({ model: "gpt-4o", messages });
  },
);
```

## Options

`Login` — `slug`, `redirectTo` (relative resolved against the request origin), `authBaseUrl?`,
`state?` (string or `(req) => string`).

`Callback` — `secretKey`, `successUrl`, `baseUrl?`, `sessionMode?` (`"infi" | "byo"`), `cookie?`
(`{ maxAgeSeconds, secure, path }`), `onAuth?` (return a `NextResponse` to take over), `onError?`.

`Usage` — `secretKey`, `baseUrl?`, `resolveCustomerId?`.

`withMeter` — `secretKey`, `meter`, `resolveCustomerId`, `value?`, `extract?`, `skipGuard?`,
`metadata?`, `baseUrl?`, `onMissingCustomer?` (default `400`), `onInsufficientCredit?` (default
`402`).
