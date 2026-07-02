# @beinfi/sdk

Email-code auth and revenue infrastructure for technical founders. One SDK for
login, usage metering and billing.

```bash
npm install @beinfi/sdk
```

## Quick start

```ts
import { Infi } from "@beinfi/sdk";

const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!, // sk_test_... / sk_live_...
  baseUrl: process.env.INFI_API_URL,       // optional, defaults to https://api.beinfi.com
});
```

Passing just a key uses the production defaults:

```ts
const infi = new Infi(process.env.INFI_SECRET_KEY!);
```

## Email-code login (public — no secret key needed)

```ts
// 1. send the 6-digit code
await infi.sendEmailCode({ slug: "your-app", email: "user@acme.com", redirectTo: "/callback" });

// 2. verify it → get the redirect URL carrying a single-use auth code
const { redirectUrl } = await infi.verifyEmailCode({ slug: "your-app", email: "user@acme.com", code: "123456" });
// navigate the browser to redirectUrl to finish the hosted flow
```

## Exchange the auth code (server-side — secret key)

```ts
const result = await infi.exchangeCode(code);         // from ?code= on your callback
// or straight from a request:
const result = await infi.exchangeCodeFromRequest({ url: req.url });

result.identity; // AppIdentity
result.customer; // { id, externalId, email, ... }
result.session;  // { token, expiresAt } | undefined
```

## Metering (server-side — secret key)

```ts
await infi.track({ customerId: "cus_123", meter: "tokens", value: "1200" });

await infi.trackBatch([
  { customerId: "cus_123", meter: "tokens", value: "1200" },
  { customerId: "cus_123", meter: "api_call", value: "1" },
]);
```

## Metered LLM (server-side — secret key)

Wrap a credit-consuming call: `meter` checks the customer has credit, runs it, then records
the usage. If the balance is exhausted it throws `InsufficientCreditError` (402) **before** the
call runs, so you never do the work for free. Token usage is auto-detected from common OpenAI
(`usage.total_tokens`) and Anthropic (`usage.input_tokens + output_tokens`) shapes.

```ts
import { InsufficientCreditError } from "@beinfi/sdk";

try {
  const res = await infi.meter({ customerId: "cus_123", meter: "tokens" }, () =>
    openai.chat.completions.create({ model: "gpt-4o", messages }),
  );
  // res is the call's result, unchanged; usage was recorded on success
} catch (err) {
  if (err instanceof InsufficientCreditError) {
    // out of credit — return a 402 / upsell (err.balance is the current balance)
  }
}
```

The credit check reads the wallet balance; prepaid drawdown settles asynchronously, so the
balance can lag by a few seconds.

| Option | Default | Notes |
| --- | --- | --- |
| `customerId` | — | Who is charged. |
| `meter` | — | Meter the usage records against (e.g. `"tokens"`). |
| `value` | auto | Explicit usage value; skips token auto-detection. |
| `extract` | auto | `(result) => number` — custom usage extractor, overrides detection. |
| `skipGuard` | `false` | Record usage without the pre-flight credit check. |
| `metadata` | — | Extra fields stamped onto the usage event. |

Read a customer's full state (enrollment + credit balance + subscriptions + current-period
usage) in one call — for dashboards/panels:

```ts
const state = await infi.customers.state("cus_123");
// { customer, credit: { balance, total }, subscriptions, usage }
```

## React

```tsx
import { InfiLogin } from "@beinfi/sdk/react";

<InfiLogin slug="your-app" redirectTo="/callback" />;
```

`UsagePanel` renders a customer's credit balance, current-period usage, and subscriptions.
It is presentational — fetch the state server-side (it needs the secret key; never fetch it
from the browser) and pass it in:

```tsx
import { UsagePanel } from "@beinfi/sdk/react";

const state = await infi.customers.state("cus_123"); // server component / loader
<UsagePanel state={state} creditLabel="credits" />;
```

## Next.js

For App Router route handlers (`Login`, `Callback`, `Usage`, `withMeter`), use
[`@beinfi/nextjs`](https://www.npmjs.com/package/@beinfi/nextjs).

## Config

| Option | Default | Notes |
| --- | --- | --- |
| `secretKey` | — | `sk_...` for server-side calls (exchange, metering). Public login needs no key. |
| `baseUrl` | `https://api.beinfi.com` | Infi API base URL. |
| `authBaseUrl` | `https://api.beinfi.com` | Hosted login base URL (served off the API host). |

Types are generated from the Infi OpenAPI spec, so requests and responses stay
in sync with the API.

MIT © Infi
