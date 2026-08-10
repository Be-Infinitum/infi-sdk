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

## Identify the payer

Beinfi does not handle your end-user login — bring your own auth and pass your own user id:

```ts
const enrollment = await infi.customers.create(productId, {
  externalId: myUserId,
  email: "user@acme.com",
});
// enrollment.id is what every billing call references
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
(`usage.total_tokens`), Anthropic (`usage.input_tokens + output_tokens`), and Vercel AI SDK
(`usage.totalTokens` / `promptTokens + completionTokens`) shapes.

```ts
import { InsufficientCreditError } from "@beinfi/sdk";

try {
  const res = await infi.meter({ enrollmentId: "enr_123", meter: "tokens" }, () =>
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

### Billing modes (`mode`)

`mode` picks the gate/record behavior by billing intent (default `"prepaid"`):

- **`"prepaid"`** — gate on the balance, then record. Blocks (402) when out of credit. For
  prepaid credits.
- **`"postpaid"`** — record only, never gate. Usage accrues and is invoiced at period close.
  For metered APIs / per-org rate-cards (no wallet to draw down). Replaces the deprecated
  `skipGuard: true`.
- **`"streaming"`** — gate now, record later. For **streaming** LLM calls where the
  token count only settles after the stream finishes: `meter` gates on the way in, you record
  the real value yourself with `infi.track(...)` in the stream's `onFinish`.

```ts
// postpaid metered API — one unit per request, no gate
await infi.meter({ enrollmentId, meter: "api_call", value: 1, mode: "postpaid" }, () => handle(req));

// streaming — gate now, record the settled tokens later
const result = await infi.meter({ enrollmentId, meter: "tokens", mode: "streaming" }, () =>
  streamText({ model, messages, onFinish: ({ usage }) =>
    infi.track({ customerId: enrollmentId, meter: "tokens", value: usage.totalTokens }) }),
);
```

| Option | Default | Notes |
| --- | --- | --- |
| `enrollmentId` | — | Who is charged. The id from `products.enroll` — the same id the credit gate and `customers.state` read. Preferred over `customerId`. |
| `customerId` | — | Alias for `enrollmentId` (the backend also resolves an external id here, but the prepaid gate only reads the enrollment id). |
| `meter` | — | Meter the usage records against (e.g. `"tokens"`). |
| `mode` | `"prepaid"` | `"prepaid"` \| `"postpaid"` \| `"streaming"` — see above. |
| `value` | auto | Explicit usage value; skips token auto-detection. Use for flat/per-unit metering (`value: 1` per request/lead/send). |
| `extract` | auto | `(result) => number` — custom usage extractor, overrides detection. |
| `skipGuard` | `false` | **Deprecated** — use `mode: "postpaid"`. |
| `metadata` | — | Extra fields stamped onto the usage event. |

Read a customer's full state (enrollment + credit balance + subscriptions + usage) in one call
— for dashboards/panels. Pass a `{ from, to }` window to read a specific period (default is the
current period):

```ts
const state = await infi.customers.state("enr_123");
// { customer, credit: { balance, total }, subscriptions, usage }

const lastMonth = await infi.customers.state("enr_123", { from: "2026-06-01", to: "2026-07-01" });
```

## React

`UsagePanel` renders a customer's credit balance, usage per meter (with rated amount when
priced), the usage period, and subscriptions. It is presentational — fetch the state
server-side (it needs the secret key; never fetch it from the browser) and pass it in:

```tsx
import { UsagePanel } from "@beinfi/sdk/react";

const state = await infi.customers.state("enr_123"); // server component / loader
<UsagePanel state={state} creditLabel="credits" />;

// postpaid model (no wallet) on a dark host: drop the credit row, theme for dark
<UsagePanel state={state} hideCredit theme="dark" />;
```

Props: `hideCredit` (omit the balance section — for postpaid/no-credit models), `theme`
(`"light"` \| `"dark"`, sets default text colors), `hideSubscriptions`, plus `className` /
`classNames` and `--infi-panel-*` CSS variables for theming.

## Next.js

For App Router route handlers (`Usage`, `State`, `withMeter`), use
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
