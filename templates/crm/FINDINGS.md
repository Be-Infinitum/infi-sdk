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

## Metered-LLM surface adoption (DevEx)

Adopting `withMeter` (`@beinfi/nextjs`) + `customers.state` / `UsagePanel`
(`@beinfi/sdk`) into the CRM, learned only from READMEs, CHANGELOG, and exported
`.d.ts`. The metered-LLM surface is clean for its intended shape (an LLM POST route),
but this app meters a **business write behind a Server Action**, and that mismatch is
where all the friction lives.

| Step | Effort (1 trivial → 5 painful) | Notes |
| --- | --- | --- |
| Read the API from the public surface | 1 | README + `.d.ts` JSDoc were enough; every option was documented. |
| `UsagePanel` on a usage view (`customers.state`) | **1** | One server-side read + presentational component. Drop-in. |
| Wire `resolveCustomerId` to the current user | **1** | `async () => (await getCurrentUser())?.id`. Cookie-based `getSession` needs no `req`, so it maps cleanly. |
| `value: 1` for a flat (non-token) unit | 2 | Works, but the whole surface is token-shaped ("Metered LLM routes"); a flat unit reads as off-label. |
| Wrap the lead ingest in `withMeter` | **4** | The ingest was a **Server Action**, not a POST route. `withMeter` is route-handler-only, so this forced a rewrite: new `app/api/contacts/route.ts` + client `fetch` + client-side 402 handling. |

### Frictions (each with the one-liner SDK fix)

1. **`withMeter` is App-Router-route-only; the idiomatic Next 15 mutation (Server
   Actions) can't use it.** The lead `track()` fired from `createContact` (a server
   action called from a `useTransition`). Adopting `withMeter` meant converting it to a
   POST route, changing the client from `await createContact(fd)` to `fetch("/api/contacts")`,
   and hand-writing the 402 branch — the single biggest cost of adoption.
   **Fix:** ship a Server-Action wrapper, e.g. `meterAction(options, actionFn)` (or a bare
   `guardCredit({ customerId, meter, value })` you can call at the top of an action), so
   metering fits the app's existing mutation pattern without a route rewrite.

2. **Gating puts billing on the critical path — the opposite of the app's prior
   stance.** The old code was fire-and-forget ("never block the write on billing").
   `withMeter` 402s *before* the handler, so an out-of-credit customer now can't create a
   contact at all. That's arguably correct for "charge per lead", but it's a silent
   behavior flip with no middle setting.
   **Fix:** document the gate-vs-record tradeoff prominently, and pair `skipGuard` with a
   "record-only, never block" recipe for teams that want metering off the critical path.

3. **The handler must return plain data, never a `NextResponse` — and there's no clean
   business-error path.** `withMeter` calls `NextResponse.json()` on the return value, so
   returning a `NextResponse` (e.g. a 400 for a bad body) double-wraps it. The only way to
   short-circuit is to `throw`, which surfaces as a generic 500. Fine for LLM calls (succeed
   or throw); awkward for a route doing input validation.
   **Fix:** let the handler return a `Response`/`NextResponse` and have `withMeter` pass it
   through untouched (recording usage only on 2xx), or expose a typed
   `abort(status, body)` helper.

4. **`resolveCustomerId` resolves the customer but doesn't hand it to the handler.** The
   gate already resolved `getCurrentUser()`, yet the handler must resolve it again to FK the
   contact row — the session/DB round-trip runs twice per request.
   **Fix:** pass the resolved customer id (and/or a context object) as a second arg to the
   handler: `handler(req, { customerId })`.

5. **Flat `value: 1` is off-label in a token-shaped API.** Every doc, example, and the
   auto-detection (`usage.total_tokens`) assume LLM token usage. Metering "1 lead" works via
   `value`, but nothing in the naming (`meter`, "Metered LLM routes") signals that flat-unit
   metering is a first-class use.
   **Fix:** document a "flat / per-unit metering" example alongside the token one, or add a
   `units` sugar for `value` so the intent reads clearly.

### Could not use from the public surface
- Nothing was blocked. The README's `withMeter` example references a `getSessionCustomer(req)`
  helper that isn't exported (it's the app's own), but the exported `getSession`/`getCurrentUser`
  pattern already in this repo covered `resolveCustomerId` without guessing.

### Resolved

The two adoption blockers above are fixed in `@beinfi/nextjs`; the CRM now meters
the lead ingest from its **original Server Action** — no route, no `fetch`, no
hand-written 402.

- **Friction #1 (route-only, forced Server Action rewrite) — fixed by
  `meterAction` / `guardCredit`.** `meterAction(options, actionFn)` wraps a Server
  Action in the same gate + record as `withMeter` and returns the action's plain
  value (composes with `useTransition`, `<form action>`, `useActionState`);
  `guardCredit({ secretKey, baseUrl, customerId })` is a bare gate for the top of a
  multi-step action. `createContact` reverted to a Server Action wrapped with
  `meterAction`, called via `await createContact(formData)`; the `app/api/contacts`
  route + client `fetch` + 402 branch are deleted.
- **Friction #2 (gate on the critical path) — fixed by `mode: "postpaid"`.** CRM
  charges per lead ingested (usage), so the wrapper records one `leads_ingested`
  unit **without gating** — an empty wallet never blocks contact creation, keeping
  billing off the critical path (matching the app's original fire-and-forget stance,
  now first-class instead of a manual `.catch()`).
