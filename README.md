# @beinfi/sdk

Email-code auth + metering SDK for [Beinfi](https://beinfi.com) — a thin, typed
TypeScript client over the Beinfi API OpenAPI contract.

The login flow is **slug-scoped email codes**: the user enters their email, gets a
6-digit code, and you verify it. Verification returns a `redirectUrl` carrying a
single-use auth code, which your server exchanges for a session.

## Install

```bash
npm install @beinfi/sdk
```

## Mode A — Embedded React

A drop-in two-step component (email → code) that redirects to the returned URL.

```tsx
import { InfiLogin } from "@beinfi/sdk/react";

<InfiLogin slug="acme" redirectTo="https://app.example.com/callback" />
```

```ts
// app/callback/route.ts — exchange the auth code for a session
import { Infi, setSessionCookie } from "@beinfi/sdk";

const infi = new Infi(process.env.INFI_SECRET_KEY!);

export async function GET(req: Request) {
  const result = await infi.exchangeCodeFromRequest({ url: req.url });
  const res = Response.json(result);
  if (result.session) setSessionCookie(res, result.session);
  return res;
}
```

## Mode B — Hosted login

Redirect to the Beinfi-hosted login page; the callback exchanges the auth code.

```tsx
import { startHostedLogin } from "@beinfi/sdk/react";

<button onClick={() => startHostedLogin({ slug: "acme", redirectTo: "/callback" })}>
  Sign in
</button>
```

## Mode C — Headless

Drive the flow from your own UI. These two calls hit public endpoints and need
no API key.

```ts
const infi = new Infi({ baseUrl: process.env.NEXT_PUBLIC_INFI_API_URL });

await infi.sendEmailCode({ slug: "acme", email, redirectTo: "/callback" });
const { redirectUrl } = await infi.verifyEmailCode({ slug: "acme", email, code });
window.location.assign(redirectUrl);
```

Read public branding/config for a hosted page:

```ts
const config = await infi.getAppConfig("acme"); // { appName, slug, sessionMode, … }
```

## Metering — usage ingestion

Server-side only (requires a secret key).

```ts
const infi = new Infi(process.env.INFI_SECRET_KEY!);

await infi.track({ meter: "tokens", value: "1500", customerId: "cust_123" });

await infi.trackBatch([
  { meter: "tokens", value: "1500", customerId: "cust_123" },
  { meter: "requests", value: "1", customerId: "cust_123" },
]);
```

## API surface

| Method | Endpoint | Auth |
| --- | --- | --- |
| `sendEmailCode({ slug, email, redirectTo?, state? })` | `POST /identity/apps/{slug}/email-code` | public |
| `verifyEmailCode({ slug, email, code })` → `{ redirectUrl }` | `POST /identity/apps/{slug}/verify-code` | public |
| `getAppConfig(slug)` | `GET /identity/apps/{slug}/config` | public |
| `exchangeCode(code)` / `exchangeCodeFromRequest(req)` | `POST /identity/exchange` | secret key |
| `track(event)` | `POST /metering/events` | secret key |
| `trackBatch(events)` | `POST /metering/events/batch` | secret key |
| `buildHostedLoginUrl` / `startHostedLogin` | `GET /identity/apps/{slug}/login` | — |

## Local development

```bash
bun install
bun run codegen   # regenerate types from ../backend/api/openapi.yaml
bun run build
bun run test
```

Point `INFI_API_URL` at a running Beinfi API (`go run ./cmd/api` in the backend repo).
See `examples/next-email-code` for a full Next.js demo of all three modes.
