# @beinfi/sdk

Get paid for what your product does. Metering, billing and collection for
technical founders — you keep your own auth and your own UI.

```bash
npm install @beinfi/sdk
```

Two ways in, depending on how much you want to build:

- **Send a link.** `infi.links.create(...)` gives you a URL. The payer opens it
  and pays; we handle checkout, the payment method and which provider takes the
  money. Nothing to build on your side.
- **Meter usage and bill it.** Record what your product consumed and turn it
  into an invoice at the end of the cycle.

## Quick start

```ts
import { Infi } from "@beinfi/sdk";

const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!, // sk_test_... / sk_live_...
});
```

The host is resolved from the key: `sk_live_…` talks to production, anything
else to sandbox. You never pass a base URL for prod. Passing just the key works
too:

```ts
const infi = new Infi(process.env.INFI_SECRET_KEY!);
```

## Get paid with a link

The shortest path from "I have a product" to "someone paid me". The link is
reusable and revocable, and no payer is known when you create it — the customer
and the invoice are materialized when someone actually submits:

```ts
const link = await infi.links.create(productId, { slug: "acme" });
link.url; // https://app.beinfi.com/pay/acme/links/plink_… — send this

await infi.links.list(productId, { slug: "acme" });
await infi.links.revoke(productId, link.id); // permanent; invoices already created stay payable
```

No checkout page, no card input, no PCI scope, no provider SDK in your app.
Which provider collects is decided by routing at payment time, not by you.

## Identify the payer

Beinfi does not handle your end-user login — bring your own auth and pass your own user id:

```ts
const enrollment = await infi.customers.create(productId, {
  externalId: myUserId,
  email: "user@acme.com",
});
// enrollment.id is what every billing call references
```

## Idempotency

Every call that changes something sends an `Idempotency-Key`. The SDK generates
one if you don't pass it, so retries of a failed request are safe by default.

**That default does not protect a double-clicked Buy button.** The key is
generated *per call*, and a second click is a second call — it gets a fresh key
and creates a second invoice. To collapse both into one, derive the key from
something stable about the intent and pass it in:

```ts
const chave = `pedido-${userId}-${productId}-${new Date().toISOString().slice(0, 10)}`;

const { invoice } = await infi.checkout({ slug, productId, customer, idempotencyKey: chave });
await infi.pay.charge({ slug, invoiceId: invoice.id, method: "pix", idempotencyKey: `${chave}-pix` });
```

Server behaviour:

| | |
| --- | --- |
| Same key, same body | The original response, replayed. One invoice. |
| Same key, **different** body | `409 idempotency_key_reused` — you reused a key for something else |
| No key | `400 idempotency_key_required` |

### Where to pass it

Three shapes, depending on the call:

```ts
// Resource methods: trailing argument
await infi.products.create(input, chave);
await infi.invoices.send(invoiceId, chave);
await infi.links.revoke(productId, linkId, chave);

// The two shortcuts: an option, because their arguments are already objects
await infi.checkout({ …, idempotencyKey: chave });
await infi.pay.charge({ …, idempotencyKey: chave });

// Usage events: NOT a header — and it takes TWO fields, see below
await infi.track({
  customerId, productId, meter: "tokens", value: "1200",
  eventId: chave,
  timestamp: quandoAconteceu,   // obrigatório para deduplicar
});
```

### Usage events dedupe on `eventId` **and** `timestamp`

This one costs money to get wrong, so it is worth stating exactly. Ingestion
dedupes on `(customer, meter, eventId, timestamp)` — the event time is part of the
key. Measured against the API:

| What you send twice | Result |
| --- | --- |
| same `eventId`, no `timestamp` | **both stored** — `duplicate: false` twice, usage counted twice |
| same `eventId` **and** same `timestamp` | second answers `duplicate: true`, counted once |
| neither | both stored |

Omitting `timestamp` lets the server stamp each call separately, so two calls are
two different events no matter what `eventId` says. If you replay usage — a queue
retry, a cron, a backfill — **pin both fields to the event, never to the call.**
The SDK fills `eventId` with a random value when you omit it, which is fine for
one-shot sends and useless for replays.

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

## Webhooks

Verify every inbound event — signature and timestamp — before acting on it. The
event type travels in a header, not in the body:

```ts
import { verifyWebhook, WEBHOOK_EVENT_TYPES, type PaymentConfirmedData } from "@beinfi/sdk";

const event = infi.verifyWebhook<PaymentConfirmedData>(
  {
    id: req.headers["x-webhook-id"],
    timestamp: req.headers["x-webhook-timestamp"],
    signature: req.headers["x-webhook-signature"],
    eventType: req.headers["x-webhook-event-type"],
    body: rawBody, // exact bytes — a re-serialized JSON will not verify
  },
  process.env.INFI_WEBHOOK_SECRET!,
);
```

`WEBHOOK_EVENT_TYPES` is the runtime list of what the backend emits. `sync`
validates declared events against it, so a typo fails before it registers an
endpoint that can never fire.

### Deduplicate on the invoice, not on the event

Delivery is at-least-once. In a flow that moves money — crediting a wallet,
granting access — processing the same event twice is free balance, so
idempotency is yours to own.

**The obvious key is the wrong one.** Keying on the event id lets two distinct
deliveries for the same invoice both through; they are still one purchase. Key
on the invoice:

```ts
const key = `invoice:${event.data.invoiceId}`;
if (await wasProcessed(key)) return ok();
await markProcessed(key);   // mark BEFORE the effect
await creditWallet(...);
```

Mark before the effect, not after: a crash in between costs one lost credit,
which is recoverable. The other order costs a duplicate credit, which is money.

Answer 2xx for anything you decided not to act on. A 4xx tells the backend to
redeliver an event that will never succeed.

### You may not need a webhook at all

To credit a wallet when someone buys a top-up, declare the grant and let the
platform do it — no endpoint, no signature check, no idempotency of your own:

```ts
{ key: "topup-500k", type: "item", pricingModel: "one_time", basePrice: "19.90",
  grants: [{ meter: "tokens", amount: "500000", on: "payment" }] }
```

`on: "payment"` credits on `payment.confirmed`; `on: "cycle"` credits at each
period open.

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
| `secretKey` | — | `sk_...` — required for every call in this README. Server-side only; never ship it to a browser. |
| `mode` | inferred | `"sandbox"` \| `"live"`. Inferred from the key prefix; set it only to override. |
| `apiUrl` | per mode | Override the API host (local dev / self-host / tests). |
| `appUrl` | `https://app.beinfi.com` | Host serving hosted checkout — what `links.create` builds its URL from. |

Types are generated from the Infi OpenAPI spec, so requests and responses stay
in sync with the API.

MIT © Infi
