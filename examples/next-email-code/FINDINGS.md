# Email-code auth on a metered send — DX report

Next.js App Router example (`@beinfi/nextjs` + `@beinfi/sdk`). Three co-equal
email-code auth modes: **Embedded** (`InfiLogin`), **Hosted** (redirect +
`Callback`), **Headless** (`sendEmailCode` / `verifyEmailCode` from your own UI).
Same lens as the other examples: dev-first / agentic-first. This report covers
adopting the new **metered-LLM surface** (`withMeter`, `customers.state`,
`UsagePanel`) onto a **non-LLM, pre-auth "send"**.

## Metered-LLM surface adoption (DevEx)

### Verdict: **6 / 10** — it works, but the wrapper is shaped for a different job

`withMeter` is built for an authed customer calling an LLM. Here the metered unit
is a boolean "email sent" with **no customer at call time**. It adopts cleanly
only because `value: 1` sidesteps token detection and because I could invent an
app-level budget customer to satisfy the required `resolveCustomerId`. Both are
workarounds, not fits.

| Step | Effort (1 trivial → 5 painful) | Notes |
| --- | --- | --- |
| Find the "send route" to wrap | 3 | There isn't one — the send is client-side (`infi.sendEmailCode`) and also lives inside `InfiLogin` + the hosted redirect. Had to **create** a server POST route. |
| Wrap send in `withMeter` (`value: 1`) | 2 | Wrapper itself is one call; picking a `meter` name + `value: 1` is obvious once you know a send isn't token-shaped. |
| Rewire client send → metered route | 2 | Headless `sendHeadless()` now `fetch("/api/send-code")` and handles 402/400. Only covers 1 of 3 modes (see #3). |
| `resolveCustomerId` for a pre-auth send | 4 | No customer exists yet. Had to introduce a synthetic app-budget customer (`INFI_METER_CUSTOMER_ID`). |
| Show usage (`customers.state` + `UsagePanel`) | 3 | No authed dashboard surface in a login demo. Rendered the **app's** send-budget state in a server component in `layout.tsx`. |
| Typecheck (`tsc --noEmit`) | 1 | Passed clean. |

### Frictions

1. **`resolveCustomerId` mismatch — no customer at send time (severity: high).**
   `MeterRouteOptions.resolveCustomerId` is required and means "who is charged."
   In an email-code send the user has only typed an email; the customer/session
   is not created until *after* `verifyEmailCode` + callback exchange. I metered
   against an app-level budget customer instead. **Fix:** support a non-customer
   meter subject (e.g. `resolveSubject` returning an app/tenant id, or a
   `subjectType: "app" | "customer"`) so pre-auth / app-scoped metering is a
   first-class mode rather than a fake customer id.

2. **LLM-shaped ergonomics on a non-LLM unit (severity: medium).** README, JSDoc,
   and the option names ("Metered LLM routes", token auto-detect from
   OpenAI/Anthropic shapes, `meter: "tokens"`) all assume an LLM response. For a
   send, the handler returns nothing meaningful, so I return a throwaway
   `{ sent: true }` purely because `withMeter` serializes the handler result as
   the response body. **Fix:** document a "unit event" recipe (`value: N`, handler
   may return `void`/`true`) and let the wrapper emit a default `{ ok: true }`
   when the handler is void — so metering a discrete action doesn't need a filler
   return value.

3. **Only 1 of 3 send paths is meterable (severity: high).** The send also happens
   inside `InfiLogin` (client component) and the hosted-login redirect, both of
   which call the backend directly and bypass any server route. `withMeter` can
   only gate a route you own, so Embedded + Hosted sends stay unmetered. **Fix:**
   meter the send at the identity endpoint (`POST /identity/apps/{slug}/email-code`)
   server-side, or expose a `Send`/metered variant in `@beinfi/nextjs` that the
   drop-in components can be pointed at — otherwise "meter every send" is
   impossible without abandoning the drop-ins.

4. **New client error contract from wrapping (severity: low).** Direct
   `sendEmailCode` either resolves or throws an SDK error. The metered route adds
   HTTP 402 (out of credit) and 400 (missing customer) that the client must now
   translate. Minor, but it's a contract change the drop-in `InfiLogin` wouldn't
   know how to surface. **Fix:** ship a typed client helper (or teach `InfiLogin`)
   to map 402/400 to the existing `onError` channel.

5. **`UsagePanel` has no natural home here (severity: low).** It needs a
   `CustomerState` (secret-key, server-side) and a customer id. A login demo has
   no post-auth dashboard, and there's no per-user wallet pre-auth. I mounted it
   in `layout.tsx` showing the **app's** send budget — a reasonable "other side of
   the meter" view, but not the per-user balance the component implies. **Fix:**
   fine as-is for app-scoped metering; for per-user, `UsagePanel` needs a flow
   that runs after `getSession` resolves a customer.

### Resolved / still-open

- **Resolved — intent is now explicit.** Setting `mode: "postpaid"` on the send
  route states what an app send budget actually is: a usage signal that records
  every send but never hard-blocks on a wallet balance. Previously the route
  leaned on the implicit default (`"prepaid"`: gate + record), which would 402 a
  legitimate login mid-flow once the app budget hit zero. `postpaid` drops that
  reliance and makes anti-abuse metering the deliberate choice, not a side effect.
  (This also makes the 402 path in friction #4 a non-event for this route — only
  the 400 "missing customer" contract remains.)
- **Still open — app-scoped metering with no customer at send time.** Metering
  against `INFI_METER_CUSTOMER_ID` (the app's own budget customer) stays a
  documented, legitimate pattern for a pre-auth send: there is no end-user
  customer yet, and forcing one would be a fiction. A first-class non-customer
  meter subject (frictions #1 / #6 — `resolveSubject` / `subjectType: "app"`)
  remains a future nicety, not a blocker.

### What was easy (keep)

- `withMeter(options, handler)` is genuinely one call, and `value: 1` cleanly
  overrides token auto-detection for a discrete unit.
- `secretKey`/`baseUrl` plumbing matches the existing `Callback`/`Login` blocks —
  no new env conventions beyond the (arguably needed) meter customer id.
- `UsagePanel` is purely presentational (no hooks, no fetching), so it drops
  straight into a server component next to the `customers.state` call.
- The whole adoption typechecks with zero changes to `packages/**` — the public
  types (`MeterRouteOptions`, `CustomerState`, `UsagePanelProps`) were enough to
  build against without reading source.

### Could not use from the public surface

- Nothing was blocked. `withMeter`, `Infi#customers.state`, and `UsagePanel` were
  all callable from README + `dist/*.d.ts` + CHANGELOG alone. The gaps above are
  fit/ergonomics, not missing surface.
