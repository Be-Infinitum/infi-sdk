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

## React

```tsx
import { InfiLogin } from "@beinfi/sdk/react";

<InfiLogin slug="your-app" redirectTo="/callback" />;
```

## Next.js

For App Router route handlers (`Login`, `Callback`, `Usage`), use
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
