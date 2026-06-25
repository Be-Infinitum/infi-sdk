# @infi/sdk

Magic-link auth SDK for [Beinfi](https://beinfi.com) — thin TypeScript client over the Beinfi API OpenAPI contract.

## Install

```bash
npm install @infi/sdk @infi/sdk/react
```

## Mode A — Embedded React

```tsx
import { InfiLogin } from "@infi/sdk/react";

<InfiLogin publishableKey={process.env.NEXT_PUBLIC_INFI_PK!} redirectTo="/callback" />
```

```ts
// app/callback/route.ts
import { Infi, setSessionCookie } from "@infi/sdk";

const infi = new Infi(process.env.INFI_SECRET_KEY!);
export async function GET(req: Request) {
  const result = await infi.validateMagicLinkFromRequest({ url: req.url });
  const res = Response.json(result);
  if (result.session) setSessionCookie(res, result.session);
  return res;
}
```

## Mode B — Hosted login

```tsx
import { startHostedLogin } from "@infi/sdk/react";

<button onClick={() => startHostedLogin({ slug: "default", redirectTo: "/callback" })}>
  Sign in
</button>
```

## Mode C — Headless

```ts
await infi.sendMagicLink({ email, redirectTo: "/callback" });
const result = await infi.validateMagicLink(token);
```

## Local development

```bash
bun install
bun run build
bun run test
```

Point `INFI_API_URL` at a running Beinfi API (`go run ./cmd/api` in the backend repo).
