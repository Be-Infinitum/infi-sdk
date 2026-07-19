# @beinfi/auth

Framework-agnostic Infi auth helpers built on Web **`Request`/`Response`**.

Use from Hono, Express (with adapter), Cloudflare Workers, Bun, or any stack that
speaks the Fetch API. For Next.js App Router, prefer `@beinfi/nextjs`.

## Install

```bash
npm install @beinfi/auth @beinfi/sdk
```

## Hosted login + callback

```ts
import {
  createLoginHandler,
  createCallbackHandler,
  createStateHandler,
} from "@beinfi/auth";

// Hono example — same handlers work anywhere
app.get("/api/auth/login", createLoginHandler({
  slug: process.env.INFI_SLUG!,
  redirectTo: "/callback",
  authBaseUrl: process.env.INFI_AUTH_BASE_URL,
}));

app.get("/callback", createCallbackHandler({
  secretKey: process.env.INFI_SECRET_KEY!,
  successUrl: "/",
}));

app.get("/api/state", createStateHandler({
  secretKey: process.env.INFI_SECRET_KEY!,
  resolveCustomerId: (_req, session) => session.customer?.id,
}));
```

## Why a separate package?

`@beinfi/nextjs` wraps Next-specific route handlers. `@beinfi/auth` is the same
flow without framework coupling — one less thing for agents to hand-wire in
Vite/Hono/Lovable projects.
