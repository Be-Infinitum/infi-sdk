# Building a CRM on the Infi SDK — DX report

How hard was it to build a real app (Next.js + Prisma + shadcn CRM: auth, per-user
data, usage metering) on `@beinfi/sdk` + `@beinfi/nextjs`? Written from the builder's
seat, dev-first / **agentic-first** lens (would an agent get this right on the first pass?).

## Verdict: **9 / 10** — the one blocker is now fixed

Original build scored 7.5, dragged down by one missing primitive: resolving the
logged-in user from the session. **We then shipped it** (`getSession` in
`@beinfi/nextjs` + backend `GET /identity/session`), and re-scored.

| Step | Effort (1 trivial → 5 painful) | Notes |
| --- | --- | --- |
| Install + workspace wiring (`workspace:*`) | 1 | Just worked. |
| Login (hosted redirect) | **1** | `export const GET = Login({ slug, redirectTo })`. One line. |
| Callback → session cookie | **1** | `export const GET = Callback({ secretKey, successUrl })`. Back to one line (no `onAuth`). |
| Usage metering (`infi.track`) | 2 | One call. `value: "1"` as a string is the only wart. |
| Resolve current user from session | ~~4~~ → **1** | **Fixed.** `const s = await getSession({ secretKey })` then `s.customer`. No Session table, no `onAuth`. |
| Data model / server actions | 1 | Normal Prisma. Not SDK-related. |

Before: an agent nailed login/callback/metering, then got stuck on "who is the
current user?". After: `getSession()` returns `{ identity, customer, expiresAt }`
in one call. The CRM's `Session` model and callback `onAuth` were deleted.

## Findings (problem → impact → fix)

1. **✅ FIXED — session → customer resolution.** Was: `infi_session` opaque, no
   introspection, every integrator had to build a `token → user` table via `onAuth`.
   Now: backend `GET /identity/session` (secret-key auth, verifies the HMAC-signed
   token, tenant-scoped, hydrates identity + customer) + `infi.getSession(token)` in
   `@beinfi/sdk` + `getSession({ secretKey })` in `@beinfi/nextjs`. The CRM deleted its
   `Session` model and `onAuth`; `src/lib/auth.ts` is now `getSession()` + a lazy upsert.
   **Impact:** the single biggest source of friction; the one thing an agent gets wrong.
   **Fix (highest leverage):** ship `getSession()` / `getCurrentCustomer()` in
   `@beinfi/nextjs` that reads the cookie and returns `{ identity, customer }` — backed by
   a backend `GET /identity/session`. That deletes the `Session` table from every app.

2. **No customers API in the SDK.** `customerId` only comes from the login exchange.
   Server-to-server ingestion (no interactive login) can't create/lookup a customer.
   **Fix:** `infi.customers.create/get/list`.

3. **`track` value is a string decimal.** `value: "1"`.
   **Fix:** accept `number`, serialize internally.

4. **Docs drifted from the real API.** The public docs briefly described a fictional
   surface (`infi.customers.create`, `recordUsage`, `InfiProvider`, a catch-all
   `Infi({...})` handler). An agent following them would fail immediately. (Now fixed.)
   **Fix:** generate the docs' code samples from the SDK, or snapshot-test them.

5. **Prod-only default base URLs.** Had to pass `baseUrl` everywhere for local dev.
   **Fix:** read `INFI_API_URL` by default, or a dev preset.

6. **No webhook helper** for reacting to `invoice.closed` / usage-threshold server-side.

## What was genuinely easy (keep it)

- `Login` / `Callback` / `Usage` as route-handler factories — exactly the right shape
  for App Router. Copy-paste, done.
- The cookie is set automatically after `Callback`. No manual session plumbing.
- Metering is truly one call and fire-and-forget friendly (off the critical path).
- Types are generated from OpenAPI, so payloads matched the backend with no guessing.

## To reach "agentic-first, as easy as possible"

1. **Own the session.** `getSession()` in `@beinfi/nextjs` (backed by `/identity/session`)
   is the whole ballgame — it removes the only hard step. Do this first.
2. Ship a `middleware`/route-guard recipe (or helper) for "protect these routes".
3. `track(number)` + `infi.customers.*`.
4. Keep docs mechanically in sync with the SDK.

Do #1 and this build drops from 7.5 to a 9.
