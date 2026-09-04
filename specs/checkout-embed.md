# Spec — `@beinfi/checkout`, the embeddable iframe checkout

**Status:** spec (planned). Target: `packages/checkout` = `@beinfi/checkout@0.1.0` (new package,
`.` + `./react` subpaths), `frontend/src/app/embed/*` (new route + bridge), and four
backend/infra edits v1 is genuinely blocked on. Synthesized from six dimension designs and their
adversarial critiques, re-verified against the three repos on disk 2026-09-03.

## Context

Today a merchant selling with Infi has exactly one checkout: send the buyer to
`app.beinfi.com/pay/{slug}/…`, a full-page Infi-branded surface on Infi's domain. Every existing
spec (`sdk-surface.md:75-79`, `ebook-deliverable.md:30`, `ai-chat-credits.md:50`) answers "sell
something" with that redirect, and `packages/sdk/README.md:50` sells it as a feature: *"No
checkout page, no card input, no PCI scope, no provider SDK in your app."*

That is still true, and it is still the right default. This spec adds the other option: the
buyer pays **on the merchant's own page**.

The shape is Whop's. `@whop/checkout` is one React component mounting an iframe onto a hosted
checkout; every prop has a `data-whop-checkout-*` twin so it also works in Framer and Webflow;
callbacks and imperative controls ride a `postMessage` channel. We copy that, because a merchant
who has seen it already knows ours.

This repo has been here before. `23ef73a` — *"feat(sdk)!: drop the raw-PAN card path and the
checkout components"* — deleted `react/InfiCheckout`, `react/InfiPixQr` and `react/InfiCardForm`.
The objection was never React components in the SDK; it was the PAN in the merchant's DOM. That
commit names the replacement out loud: *"Card capture is being rebuilt as **an embed that keeps
the PAN between the browser and the provider**."* This is that embed.

## Design principles

- **The merchant's page makes zero cross-origin requests.** That is the load-bearing property,
  not an implementation detail — see "Why an iframe" below.
- **The `plink_*` token stays the whole capability.** No key in the browser in v1. The backend
  OpenAPI already says it: *"holding it is the whole authorization, which is why these routes
  take no API key."*
- **`onComplete` is not proof of payment.** It is a client-side event on a page the merchant
  controls. Fulfilment keys off the `payment.confirmed` / `checkout.session.completed` webhook.
  Stated in one sentence on the first screen of the README.
- **Ignore only what cannot be wrong** (`stripe-compat.md:152`). Cosmetic props are accepted and
  documented; anything touching money, routing or identity throws.

## Why an iframe, stated plainly

Because CORS makes the alternative a different, larger project.

`internal/middleware/cors.go:37-113` is a **process-global env allowlist**
(`PULSE_CORS_ALLOWED_ORIGINS`), applied once at the mux root. `originAllowed` returns false on an
empty list; `AllowAnyOrigin()` is gated on `PULSE_ENV=dev`. A merchant page at `shop.acme.com`
calling `/pay/…` gets a 204 preflight with **no** `Access-Control-Allow-Origin` and the browser
blocks it. Native components on a merchant domain are dead on arrival.

This is recorded, not accidental. ADR 0025 deleted the per-tenant origin allowlist along with
product auth: *"Cross-origin embedded checkout lost its allowlist, and is fail-closed for now…
If merchant-embedded checkout is wanted, it needs an allowlist owned by payments — a small,
deliberate feature, not an inheritance from auth."* Restated at
`internal/checkout/handler.go:97-105`.

Inside the iframe the page is served from `app.beinfi.com`, so its fetches carry
`Origin: https://app.beinfi.com`, already in both configmaps. **v1 needs no CORS work at all.**

The trade, and it must be said on the first screen of the README rather than discovered in
staging: **theming is a handful of documented knobs, not the merchant's own CSS.** They are
embedding our surface, not composing ours out of their components.

The SDK's own doc comment is stale and should be fixed in this change:
`packages/sdk/src/resources/pay.ts:62` still claims "per-tenant CORS".

## The mission

One static HTML file served by `python3 -m http.server 5173` — an origin Infi has never heard of
and cannot allowlist — renders `<InfiCheckoutEmbed slug="acme" environment="sandbox"
linkToken="plink_…" onComplete={…}/>`. A buyer types an email and the CPF `52998224725`, picks
Pix, and a QR renders inside the frame. In a second tab, `/sandbox/pix/{paymentId}` → **Aprovar
pagamento**. Nothing is touched in the first tab. The iframe flips to a receipt on its own poll;
the **parent frame's** console logs exactly one `onComplete`; and the merchant's own server has a
webhook it verified with `verifyWebhook`.

Seen in three places: the buyer's browser at `localhost:5173`, the parent frame's console, and
the merchant's webhook log. None of them is the test suite.

If the height grows monotonically, if `onComplete` fires twice, if the console shows a CORS
error, or if the receipt needs a manual reload — it does not work.

## Verified facts (design constraints)

| Fact | Where |
|---|---|
| `/pay/{slug}/*` is unauthenticated; the `plink_` token is the capability | `openapi.yaml` `/pay/{slug}/links/{token}` |
| The token is globally unique and resolves the tenant alone; the slug is a scoping check | `db/migrations/000001_genesis.up.sql:2062`, `internal/paymentlink/store.go:79` |
| Every published product already has a link (ADR 0020) | `internal/paymentlink/service.go:37-64` |
| The hosted checkout is frameable by anyone today — no `X-Frame-Options`, no `frame-ancestors`, no `headers()` | `frontend/next.config.ts`, `src/middleware.ts` |
| Zero iframe/postMessage/CSP prior art in the frontend | exhaustive grep, 1 hit (a comment) |
| `checkout-payment-form.tsx` is 997 lines, 14 `useState`, no reducer, no context — and **no test** | `frontend/src/components/checkout/` |
| Boleto is hardcoded `available: false` | `checkout-payment-form.tsx:856-861` |
| `crypto` is a real method the SDK's generated types do not know | `cryptoEnabled` greps 6 in backend yaml, **0** in `packages/sdk/src/generated/openapi.ts` |
| `--radius` is inert — `var(--radius)` greps **zero** anywhere. But `--radius-md`/`--radius-xl` **are** consumed (3× in the design system's `components.css`, for `.beinfi-*` button/input/card) | so a `borderRadius` knob is *partial*, not impossible: design-system components would follow, Tailwind's own `rounded-*` literals would not. Not built — a knob that reshapes half the surface is worse than none |
| `stripeAccount` is a phantom field — zero hits in `backend/internal`, always `undefined` | read in 3 frontend files |
| The locale cookie is `SameSite=Lax`, so it never reaches a third-party iframe | `src/i18n/actions.ts:14` — locale **must** come from the URL |
| `"use client"` is silently stripped by this repo's tsup config | probed: 0 occurrences in ESM and CJS output |
| tsup 8.5.1 runs array configs with `Promise.all` — **in parallel** | `tsup/dist/index.js:1494` |
| `PULSE_ADYEN_ENABLED` is absent from both configmaps ⇒ no redirect provider registered | `infi-infra/apps/backend*/configmap.yaml` |

## The finding that outranks this feature

**`PULSE_TRUSTED_PROXY_CIDRS` is absent from both backend configmaps.** The backend configmap
carries 12 `PULSE_*` keys and that is not one of them. `ClientIP(trusted)` with an empty list
returns plain `clientIP` = `r.RemoteAddr` (`internal/middleware/ratelimit.go:129-131`). Behind
Traefik that is the ingress hop **for every payer on the platform**.

So both `/pay/*` limiters — the outer 5 rps/burst 5 (`cmd/api/main.go:729`) and the inner
2 rps/burst 10 applied to the whole group (`internal/checkout/handler.go:65,111`, the only
limiter in the codebase missing `WithKeyFunc`) — are **one global bucket**. Pix polls at ~0.33
rps per open checkout with no deadline; roughly six concurrent Pix checkouts saturate 2 rps and
the seventh payer gets a `429` carrying `Retry-After: 0` (`int(0.5) == 0`, `ratelimit.go:101-106`),
so a polling client hot-loops.

It has never been caught because `internal/checkout/preflight_test.go:43` builds its **own**
single limiter and then calls `h.Mount(co)` — exercising a stack that does not exist in
production.

The embed is a traffic multiplier by design: it turns `GET /pay/{slug}/links/{token}` from a
per-purchase-intent call into a per-**pageview** call, and every abandoned tab keeps polling.
Fix this first, embed or no embed.

## Architecture

```
 merchant.com (any origin)                app.beinfi.com              api.beinfi.com
 ┌──────────────────────────┐
 │ <InfiCheckoutEmbed …>    │
 │  @beinfi/checkout/react  │
 │  ├ buildEmbedUrl() ─ src ┼──► /embed/[sandbox/]{slug}/links/{token}
 │  │  resolveAppBase(env)  │      ?embedId&parentOrigin&pv=1&locale&…
 │  ├ <iframe allow="payment│    ┌─────────────────────────────────┐
 │  │  clipboard-write …">  │    │ EmbedLayout — no lang bar,      │
 │  └ message listener      │    │ no min-h-screen, no branding    │
 │     source===contentWindow    │  [data-infi-embed-root]         │
 │     origin===expectedOrigin   │  useEmbedBridge() ─ emits       │
 │     embedId + __infi match    │  CheckoutPaymentForm onEvent    │
 │                          │    │   ┌───────────────────────────┐ │
 │  onStateChange/onComplete│    │   │ js.stripe.com iframe      │ │──► PSP
 │  returnUrl → parent nav  │    │   │  (the PAN lives ONLY here)│ │
 └──────────────────────────┘    │   └───────────────────────────┘ │
        ▲                        └─────────────────────────────────┘
        └── postMessage(msg, exactOrigin)          │ fetch, Origin: app.beinfi.com
                                                   └──────────────► /pay/*
```

Three parts: the npm package owns the parent half and never talks to `api.beinfi.com`; the
`/embed` route owns the child half and is the only thing that does; the protocol is the contract.

## The protocol

`packages/checkout/src/protocol.ts` — zero imports, no DOM, no React. A byte-identical copy at
`frontend/src/lib/embed/protocol.ts`; a `diff` between them is a verification step, not a
convention.

- **Namespace and major version fused into one field**, `__infi: "checkout/v1"`, so a single
  `===` rejects every other library's postMessage traffic and every future revision.
- **A per-iframe `embedId`** minted by the parent (`inf_emb_` + 16 hex), passed as `?embedId=`
  and echoed both ways, so two embeds on one page never see each other's traffic.
- **Parent-side validation, in this order:** `event.source === iframe.contentWindow`, then
  `event.origin === expectedOrigin` (exact string from `resolveAppBase`, never a substring or a
  `startsWith`), then `__infi`, then `embedId`. Anything failing is ignored silently.
- **Child side** targets the exact `parentOrigin` it was given, validated against its own
  allowlist — never `postMessage(msg, "*")`.
- **Handshake:** the child announces `ready`; the parent queues everything sent before that.
  A timeout renders the `fallback` slot and fires `onPaymentError`.
- **Resize:** a `ResizeObserver` on the embed's own root — **not** `body`. `src/app/layout.tsx`
  sets `html h-full` / `body min-h-full`, so observing either reports the iframe's current
  viewport height forever, a latch that never shrinks. This is the mechanical reason no
  `min-h-screen` may appear in the embed tree.

Events map onto Whop's names where they mean the same thing: `onStateChange`
(`loading|ready|disabled`), `onComplete`, `onPaymentError`. Whop callbacks with no Infi meaning
(`onCurrenciesAvailable`, `onCurrencyChanged`, `onAddressValidationError`) are omitted from the
types rather than accepted and never fired.

## The public API

```tsx
import { InfiCheckoutEmbed } from "@beinfi/checkout/react";

<InfiCheckoutEmbed
  slug="acme"
  linkToken="plink_…"
  environment="sandbox"
  onComplete={({ invoiceId, paymentId, method }) => …}
/>
```

`href={link.url}` is also accepted and is the one-prop form: `links.create()` already returns
`{ ...link, url }`, so the merchant passes back the exact string the SDK handed them, parsed
client-side into `{ appBase, slug, token }`. A slug-less route is P3 (B7).

### Entry modes — the cart question

`payment_links.product_id` is `NOT NULL` and singular, and `materializeFromLink` reads exactly
that one product. **One link is one product.** A cart is not expressible as a link, and adding
line items to one would mean a browser-settable amount, which is the price-tampering hole the
money rule exists to close.

The cart is the invoice mode, and it already works: `infi.checkout({ payerId, lineItems })`
takes many line items server-side and returns an `invoiceId`, which the embed accepts instead of
a token. So the surface has two entry modes, and they land on the same split Whop has:

| | `linkToken` | `invoiceId` |
|---|---|---|
| Products | one | many — cart, custom amounts |
| Backend call per purchase | **none** | one, with `sk_` |
| The identifier is | static, public, reusable | per purchase |
| Whop's equivalent | `planId` | `sessionId` |

Modelled as a discriminated union so an invalid combination is a type error, not a runtime 404.

**The asymmetry that bites, and it is not cosmetic.** In link mode the session step *requires*
`taxId` (11 or 14 digits, 400 otherwise), so the embed collects it and a merchant cannot skip
it. In invoice mode there is **no contact step** — the customer was created on the merchant's
server — and `POST /pay/{slug}/invoices/{id}/charge` accepts only
`{method, card?, saveInstrument?, consentTextVersion?}`. There is nowhere to put a `taxId`.

So a merchant who calls `infi.checkout({ customer: { … } })` without one gets
`customer_tax_id_required` at charge time, with the buyer already looking at the screen, and
**the embed cannot rescue it**. This is cold-start audit #20 returning through the cart door.
The `CheckoutOptions` JSDoc already warns that pix and boleto on Asaas refuse a customer without
a CPF/CNPJ — but a warning in a JSDoc is not a gate. See S1.

`environment` maps to `mode` internally and feeds `resolveAppBase` — **never a literal host**.
Cold-start audit #3 and the deleted `InfiPixQr` (which defaulted to `https://api.beinfi.com`
under a sandbox key) are both this bug. A missing slug throws rather than interpolating
`undefined` (audit #11).

## Security

- **Framing policy:** `/embed/*` gets `frame-ancestors *` — we cannot know a merchant's domain in
  advance, exactly as Whop cannot. `/pay/*` gets `frame-ancestors 'none'`, which it does not have
  today. The full-page checkout being frameable by anyone is the accident this change closes.
  A per-tenant allowlist is P3, and its default must be **empty ⇒ allow**, the inverse of
  `originAllowed` — comment that inversion at the call site or someone will "fix" it.
- **iframe attributes:** `allow="payment *; clipboard-write; publickey-credentials-get *"`.
- **The clipboard is the Pix flow.** `checkout-payment-form.tsx:79-84` fires
  `toast.success(t("pixCopied"))` unconditionally after a floating
  `void navigator.clipboard?.writeText(value)`. In a cross-origin iframe without delegated
  `clipboard-write` that promise rejects and the buyer is told the code is on their clipboard
  when it is not. Await it, fall back to selecting the text, and surface the failure.
- **The protocol never carries** the PAN, Stripe's `clientSecret`, Adyen's `sessionData`, or the
  payer's full CPF.
- **PCI:** the PAN is captured by Stripe's or Adyen's own iframe, nested inside ours, two origins
  from the merchant's DOM. The merchant stays SAQ A. This is exactly the scope `23ef73a` deleted
  the raw-PAN path to avoid — and that path is now dead wiring anyway: `CardTokenizer` is
  implemented only by Asaas and Infi, which the routing catalog gives `pix` + `boleto` only, so
  `method=card` with a `card` body dies as an unclassified 500. Delete the field or 422 it.
- **`plink_` tokens are logged in plaintext.** `internal/middleware/logging.go:111` redacts only
  webhook tokens and leaves every other path unchanged, so a bearer capability is written to the
  log stream on every 3-second poll. Extend the redactor; add `email` to
  `defaultSensitiveFields` while there (`tax_id` and `client_secret` already are).

## Bugs fixed on the way

The frontend's generated schema already types all four pix fields (`schema.ts:3573-3589`), so
these are **cast deletions, not type widenings** — materially lower risk than it looks.

| # | Bug | Blocks v1? |
|---|---|---|
| (a) | `pixCode.startsWith("http")` sniffs the sandbox affordance (`:645`). The OpenAPI forbids exactly this: *"sniffing its shape is how a sandbox-only affordance reaches a production checkout."* Branch on `sandboxConfirmUrl` existing. | **Yes** — the embed is what goes on a merchant's live page, and this renders a link that leaves it |
| (b) | `PIX_EXPIRY_MS = 30*60*1000` invents the countdown, ignoring the server's `pixExpiresAt`. Render no countdown when absent rather than a fabricated one. | **Yes** — the pending event carries the deadline and a merchant may key a timeout on it |
| (c) | Stripe read from flat `clientSecret`/`publishableKey` instead of the tagged `nextAction.type`. Delete the phantom `stripeAccount` plumbing in the same commit. | No — ship anyway, 4 lines |
| (d) | **No server readback after `confirmCardPayment`** — card trusts `paymentIntent.status`, while pix, crypto and Adyen all poll. Give `StripeCharge` the `pollStatus` field `AdyenCharge` already has; `resolveCardCharge` already builds that closure for Adyen and `created.id` is on both arms, so hoist it. | **Yes, hardest.** The chain is `paymentIntent.status` → `onSuccess` → `onComplete` → **the merchant fulfils**. On the hosted page a premature receipt is embarrassing; in an embed it is a merchant shipping goods for money that never settled |
| (e) | The pix/crypto poll is a bare `setInterval(3000)` with **no deadline**, reading the whole session rather than the narrow payment status. | **Yes** — an abandoned embed tab polls forever, against the global bucket above |
| (f) | The clipboard lie (above). | **Yes** — copying the code *is* the Pix flow |

### Status — done, with tests

All six are fixed and covered. `frontend`: 65 files / 2293 tests, lint and `next build` green.

| # | What changed | Regression pinned by |
|---|---|---|
| (a) | Branch on `payment.sandboxConfirmUrl`, never on the payload's shape. The obsolete widening cast went with it — the generated schema has had the pix fields for a while, so this was a cast deletion. | a payload that *looks* like a URL with no `sandboxConfirmUrl` renders no link |
| (b) | `PIX_EXPIRY_MS` deleted; the deadline is `created.pixExpiresAt`, and **no countdown renders** when the server gave none. | no `pixExpiresAt` ⇒ no countdown; with one ⇒ counts from it |
| (c) | Stripe read from the tagged `nextAction.type === "stripe_payment_intent"`, flat pair kept as a one-release fallback. `stripeAccount` documented as provably dead rather than deleted — Connect Direct would need exactly it, and the PCI vault will revisit this seam anyway. | a charge carrying only the tagged action still resolves |
| (d) | `StripeCharge` gains the `pollStatus` the Adyen arm always had; the builder is hoisted so both providers share it. `pay()` no longer decides — `succeeded` and `processing` both mean "the browser is done", and a `confirming` state polls until the server answers. The pay button stays locked through it, and a timeout renders the existing `stillProcessing`/`checkAgain` copy. | Stripe says `succeeded`, server says `failed` ⇒ `onSuccess` **never** fires |
| (e) | The pix/crypto poll is bounded by the server's `pixExpiresAt` (15 min fallback) and reads the narrow payment status where a payment id exists. | — |
| (f) | The clipboard write is awaited; failure selects the code and reports an error instead of a success toast. Two new message keys. | a rejected write ⇒ `toast.error`, never `toast.success` |

**Three loops became one.** `src/lib/checkout/use-payment-readback.ts` — jittered, deadlined,
callbacks in refs — now serves card, pix, crypto and Adyen. Before: Adyen's was correct, pix's had
no deadline and read the whole session, and card had none at all.

**A defect found while fixing (d), not on any list:** `confirming` is not `paying`, so the pay
button re-enabled while the server was being asked and a buyer could confirm the same intent
twice. Locked, and pinned by a test.

**Why this file had no test.** jsdom implements no `window.matchMedia`, `useReducedMotion` calls
it on mount, and the whole checkout renders inside `MotionPanel`/`MotionReveal` — so *any* test of
this component threw on render. Polyfilled in `src/test/setup.ts` alongside the existing
`ResizeObserver`/`hasPointerCapture` ones. It was a missing polyfill, not neglect.

### Status — the embed route is up

`frontend`: four routes built (`/embed/[slug]/links/[token]`, `/embed/[slug]/invoices/[invoiceId]`
and their `sandbox` twins), and the URLs `buildEmbedUrl` generates were cross-checked against them
one by one. They come out smaller than the `/pay` pages they mirror (1.47 kB vs 2.97 kB), which is
the stripped chrome showing up in the manifest.

- `src/lib/embed/protocol.ts` is a **byte-identical copy** of the package's, verified with `diff`.
  That check is a release step, not a convention — the halves ship from different repos.
- `useEmbedBridge` / `useEmbedResize` own the child half. The observer targets the embed's own
  root, never `body`, and drops sub-pixel changes so parent and child cannot oscillate.
- `CheckoutPaymentForm` gained one optional `onEvent` prop. Additive: no existing caller passes
  it and behaviour is unchanged without it. `CheckoutEmbed` translates those into protocol
  messages.
- **The framing policy is now deliberate.** `next.config.ts` had no `headers()` at all, so the
  full-page checkout was frameable by anyone. `/pay/*` is now `frame-ancestors 'none'` +
  `X-Frame-Options: DENY`; `/embed/*` is `frame-ancestors *` (with no `X-Frame-Options`, which has
  no "allow any" value and would make older browsers refuse what newer ones allow) plus
  `X-Robots-Tag: noindex`.
- The wire's `PaymentMethod` omits `boleto` because the form hardcodes it unavailable, so the
  boundary narrows explicitly rather than widening the protocol to advertise a method nobody can
  pick. If boleto is ever switched on, that narrowing stops compiling — which is the point.

Not yet built: theme/locale params reaching the rendered page, `returnUrl` top-navigation, the
imperative `getEmail`/`setTaxId` handlers (the channel exists and is tested; the handlers are
stubs), and the loader script (P2).

## Backend / infra work

| # | Item | Blocks v1? |
|---|---|---|
| B0 | `PULSE_TRUSTED_PROXY_CIDRS` in both backend configmaps | **Yes** — infra only, nothing to code |
| B1 | Delete the inner limiter (`handler.go:44,65,111`) | **Yes** — 3-line deletion |
| B2 | Split read and write buckets in `Mount` — today status polling burns the charge budget | **Yes** |
| B3 | Redact `plink_` in request logs; add `email` to sensitive fields | No, ship together |
| B4 | The 5 `/pay` paths missing from `preflight_test.go` — including both payment-status routes, which are the embed's poll targets | No, free |
| B5 | Per-capability bucket keyed `slug+token` | No — P2 |
| B6 | `surface` on the charge body + widen the `/pay/` return guard | No — P3, and see below |
| B7 | `GET /pay/links/{token}` → `{slug}` for the one-prop path | No — P3 |
| B9 | Stop advertising an idempotency key `/pay` ignores | No, ship with B3 |
| B8 | `metadata` on the link checkout session, round-tripped to the webhook | No — P2, but it is what ties a payment to the merchant's own order |
| S1 | Make a missing `taxId` fail on the merchant's keyboard, not the buyer's screen | No — **needs a decision, see below** |

**Adyen is the v1 gate, and it is already closed.** `service.go:667` hardcodes
`ReturnPath: "/pay/%s/invoices/%s?payment=%s"` and `wiring.go:159` refuses anything not prefixed
`/pay/`, so an Adyen 3DS redirect would land our iframe on the full-page checkout. But
`PULSE_ADYEN_ENABLED` is absent from both configmaps, so no redirect provider is registered and
v1 is unaffected. Stripe's 3DS runs in Stripe's own overlay inside the calling frame and needs
only height. **Enabling Adyen without B6 first breaks the embed** — put that sentence next to the
flag.

**B8 — the session carries no `metadata`.** `createSessionRequest` (`internal/checkout/session.go:42-46`)
is `{email, name, taxId}` and nothing else, so a merchant cannot attach their own `orderId` and
read it back on `checkout.session.completed`. They have to match on email or store the returned
`invoiceId`. `specs/stripe-compat.md` already names this as `[be]` and not optional — *"an app
whose metadata silently does not come back does not error. It fulfils the wrong order, or no
order, at webhook time."* The embed makes it more visible, because the whole point is that the
merchant's own page starts the purchase.

**S1 — and a correction: as first written, this is not implementable.** I specified that
`infi.checkout()` should refuse a purchase-mode call with no `customer.taxId` "when the product's
`paymentOptions` include pix or boleto". It cannot know that: `paymentOptions` comes from the
public checkout read, which needs an invoice that does not exist yet, so the check would cost a
round trip on every checkout.

What *is* knowable with no fetch is stronger and simpler: **a customer created without a `taxId`
can never pay by pix or boleto.** Asaas refuses to create the payer, and no client-side change
recovers it — the 422 lands in front of the buyer.

So the real choice is a compatibility one, and it is not mine to make:

- **(a) Require `taxId` in purchase mode.** Correct for this market, where pix is the default.
  **Breaks** any existing card-only integration that omits it today.
- **(b) Require it unless the caller opts out** (`allowNoTaxId: true`). Non-breaking only if the
  default stays permissive, which defeats the point; breaking if it does not.
- **(c) Leave the signature alone and make the failure legible.** Shipped: `error-fixes.ts` now
  carries `customer_tax_id_required` plus the four charge-conflict codes the public checkout
  answers with (`charge_in_progress`, `charge_already_processing`, `method_switch_failed`,
  `invoice_not_open`), so `err.fix.hint` names the field and what to do. Non-breaking, and it
  reaches agents through the mechanism `AGENTS.md` already documents.

(c) is done. (a) is the honest fix and needs the merchant's call on breaking card-only callers.

**B9 — the idempotency key on `/pay` is accepted and ignored.** `middleware.Idempotency(pool,
auth.TenantID)` is mounted on the four authenticated groups (`cmd/api/main.go:531,548,596,604`)
and keyed on the tenant from the auth identity — which a public route has none of, so it cannot
simply be added to the `/pay` group. Meanwhile `PayResource` sends `Idempotency-Key` on every
mutating call and `defaultCORSAllowedHeaders` lets it through. Advertised, inert.

Double-charge is really prevented by invariants, and they hold: one pending charge per invoice
(`service.go:536-542`, `409 charge_in_progress`), `ResumePendingPix` returning the *same* charge
with the same QR and no second PSP call (`service.go:341-349`), the ADR 0016 session dedupe on
`(link_id, lower(email))`, and `chargeSession` reusing the session's `invoice_id` on retry. Those
are per-invoice and per-(link, email) guarantees, not per-request ones — and note that even where
the key *is* honoured it does not collapse a double click, because the SDK generates a fresh key
per call (`pay.ts:40-46`).

The embed raises the stakes: the merchant's page is where a buyer double-clicks, refreshes and
loses signal. v1 needs no change — the invariants cover it — but the header must stop claiming a
guarantee it does not give. Either honour it with a public scope key (slug + invoice, or the link
token) or stop sending it there. Sibling of B3: small, silent, and dangerous only when trusted.

## Build facts, probed rather than assumed

- `"use client"` is **silently stripped** by this repo's tsup config — zero occurrences in ESM
  and CJS. Fix: `banner: { js: '"use client";' }`, verified to land in both.
- Without `"jsx": "react-jsx"` in the package's own tsconfig, esbuild emits `React.createElement`
  with **no React import** — an instant runtime crash. `packages/sdk/tsconfig.json:4` already has
  it, which is why `UsagePanel` survives.
- `banner` is config-global, so core and React need separate configs. **tsup 8.5.1 runs array
  configs with `Promise.all`, in parallel** (`tsup/dist/index.js:1494`) — so `clean: true` on
  either one races the other's output into the same `dist/`. Put `clean` in neither and clean
  once in the `build` script. (A 12-run probe never flaked, but the mechanism is real and
  timing-dependent; do not rely on ordering.)
- The root `package.json` has **four** sites to update: `workspaces`, `build`,
  `publish:dry-run`, `publish:packages`. `test`/`typecheck` use `--filter '@beinfi/*'` and pick a
  new package up free.
- Never a caret on a first-party 0.x range — `>=x <y`, enforced by `packages/mcp/scripts/smoke.mjs`.

## Phasing

**P1 — v1.** Infra/backend B0–B4. Frontend: characterization tests for the 997-line form
*first*, then bugs (a)(b)(d)(e)(f), then (c), then the `/embed` route, layout, bridge and
headers. npm: `packages/checkout` with `.` and `./react`, the protocol, `buildEmbedUrl`,
`createCheckoutEmbed`, `InfiCheckoutEmbed`, `useCheckoutEmbedControls`, plus the agent surface —
`skills/embed-checkout/SKILL.md`, an `AGENTS.md` section, and a fix to the stale
`.cursor/rules/infi.mdc` (it references `@beinfi/auth`, a package that does not exist).

*A merchant can then:* paste one component into a React page on any origin and take a real Pix,
card or crypto payment without the buyer leaving; prefill email/name/CPF; set locale, padding,
accent, background, `hidePrice`; and either redirect to `returnUrl` or stay put.

**P2.** The plain-`<script>` loader (`data-infi-checkout-*`, `window.infiCheckout`, served from
the frontend behind Cloudflare, which already fronts the cluster), `getEmail`/`setEmail`/
`getTaxId`/`setTaxId`, a snippet generator on the payment-link screen, B5, and
`links.create().embedCode`.

*A Webflow or Framer merchant can then paste a `<div>` and a `<script>`.*

**P3.** The `pk_` publishable key, B6 + Adyen, per-tenant `frame-ancestors`, dark mode (a
design-system project: a full `.dark` token set through the private registry, a dark Stripe
`appearance`, a dark card-element style and Adyen CSS overrides), and
`checkout-payment-form.tsx` into a reducer, test-first.

## Verification

**Deploy order first, and it is not optional.** Infra B0 → backend B1–B4 to sandbox → frontend
`/embed` route to sandbox → *then* publish the npm package. Publishing before the embed route
returns 200 means every first install renders a 404 inside an iframe with nothing in the
merchant's console to explain it.

1. The mission above, end to end, from `localhost:5173`.
2. A **negative** test: a page that posts a forged message from the wrong origin, and a second
   embed on the same page — neither may reach the first embed's callbacks.
3. `diff` the two copies of `protocol.ts`.
4. Load the embed with `clipboard-write` withheld and confirm the copy button reports failure
   rather than a false success.
5. Rate limits: with B0 in place, confirm two payers on different IPs no longer share a bucket.
   Live runs `replicas: 2` with per-process in-memory limiters, so a non-reproduction here is not
   evidence the finding was wrong.

**Staging only, because tests cannot cover it:** Stripe.js and any 3DS challenge three frames
deep, Apple/Google Pay in an iframe, and `frame-ancestors` actually enforced.

## A PCI vault is coming, and it moves one seam

The merchant plans to contract a PCI vault, which captures the PAN in the vault's own frame and
hands the backend a vault token to route at any provider. Two consequences for this spec, worth
writing down before code assumes otherwise:

- **The readback survives it.** Whoever captures the card, the authoritative answer to "did this
  settle" is still ours, still `GET /pay/{slug}/…/payments/{paymentID}`. Fix (d) is not
  throwaway work.
- **The provider fork does not.** `PaymentNextAction`'s `adyen_session | stripe_payment_intent`
  union exists only because the browser has to speak the chosen provider's protocol — which is
  the coupling a vault removes. So do not generalise `resolveCardCharge`'s branch or build
  abstraction over it; it has an expiry date. Fix (c) stays a four-line correction, not a
  refactor.

It also makes the PCI sentence below provider-agnostic: the claim is that the PAN is captured in
a frame the merchant does not own, not that the frame belongs to Stripe.

## Non-goals

Native (non-iframe) checkout components on the merchant's DOM; the merchant's own CSS; a
publishable key in v1; dark mode in v1; Adyen in v1; a customer portal; **browser-settable amounts** — a
`price`/`amount`/`unitAmount` field on a browser-reachable endpoint is a 422, not a warning.

Multi-product carts are **not** a non-goal — they are supported today through the invoice entry
mode. What is excluded is pricing a cart *in the browser*.
