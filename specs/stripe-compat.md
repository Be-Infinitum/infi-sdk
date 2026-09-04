# Spec — `@beinfi/stripe-compat`

**Status:** spec (planned). Target: `packages/stripe-compat` (server) and
`packages/stripe-js-compat` (browser) in this repo, plus one CLI command and a
short list of backend work that the goal does not survive without.

## The goal, stated literally

**The merchant changes the import and keeps walking.** Not "a compatible subset",
not "most apps" — the diff on their repo is the import line, and their existing
code, with their existing IDs, sells something and gets paid.

That is a harder claim than a mapping table, and it fails in places that have
nothing to do with the API shape. This spec is organised around what has to be
true for the claim to hold, because the surface work is the easy half.

### The mission

> **A real Stripe app, cloned and run against Infi with its import lines changed
> and nothing else** — its own hardcoded `price_…` IDs, its own `cus_…` in its own
> database, its own webhook handler — sells something, and the payer pays with
> **Pix**. Seen in four places: the app's console, the app's own database row, the
> invoice in the Infi dashboard, and the merchant's Asaas account.

The app is a public `stripe-samples/` one, not one we write. An app we wrote proves
our SDK works with our SDK. Their IDs in their code is what makes the demo an
argument.

## Why it is worth it

1. **Every model already knows this API.** This SDK is agent-first (`AGENTS.md`,
   `@beinfi/mcp`, the skills). Today an agent must read our docs to integrate.
   Given a Stripe surface, it writes the integration from memory, correctly, first
   try — the training data is saturated with it. The training data becomes our
   onboarding. This is the biggest lever here, bigger than the human migration.
2. **A foreign SaaS entering Brazil has Stripe code and no Pix.** That is the
   segment. Not the PME that never had Stripe — the company whose billing code
   already exists and whose Brazilian customers want Pix and boleto.
3. **It makes routing concrete.** "Route between providers" stays abstract until
   the call that routes is a call the merchant already wrote.

Two counter-arguments, kept here rather than discovered later: a surface that is
cheap to arrive on is cheap to leave from (correct trade, made on purpose); and
the merchants who most want Pix are the least likely to already run `stripe-node`,
which is what makes the segment narrow. Good segment — just not "Brazilian PMEs",
and the landing must not say otherwise.

## What "only the import" actually costs

Four things beyond the API surface. Each one, left out, turns the demo into an app
that compiles and then fails on its first real call.

### 1. Their IDs have to resolve — the importer

Their code says `price_1QxYz…` and `cus_1Abc…`. Those live in *their Stripe
account* and in *their database*. Changing an import does not move a catalog.

`infi migrate-from-stripe --key sk_…` reads their Stripe account and recreates
products, prices, customers and subscriptions in Infi **preserving the Stripe ID
as the natural key**. Two of the three landing spots already exist:

| their ID | where it lands | state |
|---|---|---|
| `prod_…` | `products.key` — "stable per-tenant natural key for idempotent upsert" | **exists** |
| `cus_…` | `customers.externalId` — unique per tenant, enroll idempotent on it | **exists** |
| `price_…` | — | **nowhere. See below.** |

### 2. `price_…` has nowhere to land, and that is the sharpest problem

A `Price` in this backend has **no natural key, no metadata, and cannot exist
without a meter**: `meterId` is required and non-null, "a price IS a meter rate. A
flat recurring amount is not a price: it lives on the version's `basePrice`" (ADR
0017 removed meterless prices).

Stripe's `price_…` is the universal unit — one-time, flat recurring, per-seat,
metered — and every drop-in app writes `line_items: [{ price: 'price_…' }]`. So
one Stripe concept maps onto three different Infi shapes depending on its type:

| Stripe price | Infi |
|---|---|
| `recurring`, licensed | version `basePrice` — **not a row, a column** |
| `recurring`, `usage_type: metered` | a meter + a `Price` |
| `one_time` | product base price / an invoice line |

Two of those three have no ID to key on. Options, in the order I would take them:

- **(b) now — a generated map.** The importer emits `infi.stripe-map.json`:
  `price_… → { productKey, versionId, kind }`. Zero backend change, unblocks the
  demo, and the merchant ships one generated file. It goes stale, and it is a file
  they did not have before — so it is a bridge, not the answer.
- **(a) then — `prices.key`.** A per-tenant natural key on prices, plus a way to
  name a version's `basePrice`. `[schema]`, in a domain ADR 0017 narrowed on
  purpose, so it needs that ADR revisited rather than worked around.

Do not reach for (c), one Infi product per Stripe price: it abuses the one natural
key that exists and falls apart on recurring-plus-metered.

### 3. `metadata` has to round-trip, or apps break where nobody looks

Stripe apps write `metadata: { orderId }` onto sessions, payment intents and
invoices, and read it back **in the webhook**. It is the standard way a payment is
tied to a domain object. In this backend `metadata` exists on `ProductCustomer`,
`CreateCustomerRequest` and `UsageEvent` — and **not** on `Invoice`,
`CreateInvoiceRequest`, `Product` or `Price`.

An app whose metadata silently does not come back does not error. It fulfils the
wrong order, or no order, at webhook time. `[be]`, and not optional.

### 4. The webhook signature — one backend change buys the whole claim

`internal/webhook/signer.go` signs `event_id + "." + timestamp + "." + body`, hex
HMAC-SHA256, under `X-Webhook-Signature: v1=<hex>` with `X-Webhook-Id` and
`X-Webhook-Timestamp`. Stripe signs `timestamp + "." + body` and carries it all in
one `Stripe-Signature: t=…,v1=…`.

The event ID is not recoverable from a Stripe-style header, so
`constructEvent(body, sigHeader, secret)` — **the exact line every Stripe app
has** — cannot verify ours from the package side alone.

**Emit an additional `Stripe-Signature` header**, computed Stripe's way over the
same body, alongside the existing headers. Purely additive: existing subscribers
verify exactly as before. It is roughly thirty lines, and it converts the one
place where the merchant would have had to edit code into a place where they do
not. The package still accepts a headers object as a fallback for anyone who
prefers our native scheme.

### 5. Elements apps: the code compiles, the UX changes

Most real Stripe checkouts are `@stripe/stripe-js` + Elements + `client_secret`.
Asaas exposes no hosted fields, so there is nothing to build an inline card form
on — but the app does not need one to keep running.

`stripe.confirmPayment({ elements, confirmParams: { return_url } })` is
**already** allowed to redirect: that is how 3DS, boleto and Pix behave under
Stripe itself. So `@beinfi/stripe-js-compat` ships `loadStripe()` returning a shim
where `elements().mount()` renders a payment surface of ours and `confirmPayment`
navigates to our hosted checkout, returning to `return_url` with the
`payment_intent` and `redirect_status` query params their post-payment code
already reads. `retrievePaymentIntent(clientSecret)` resolves against the public
`/pay/{slug}/invoices/{id}` read.

Their code does not change. Their carefully styled inline form becomes a redirect.
That is the trade, it is a documented *differs*, and it must be said in one plain
sentence on the first screen of the README rather than discovered in staging.

Separate npm package, because their import is `@stripe/stripe-js` by name and a
subpath export of the server package is not a one-line swap of that line.

## The rule that keeps this honest

Not "never ignore a parameter" — that rule breaks the moment `appearance` shows
up. The rule is:

> **Ignore only what cannot be wrong.** Cosmetics are ignored and documented.
> Anything touching money, routing or identity — `application_fee_amount`,
> `transfer_data`, `automatic_tax`, `on_behalf_of`, `currency` we do not support —
> **throws**.

Every silent failure this codebase has produced had passing code behind it: a
feature gate that returned `next`, a rule that could not be turned on, a wallet
nothing configures. A compat layer is the easiest place in the system to
reproduce that at scale, and the failure mode is money computed quietly wrong.

## What genuinely does not migrate

Named so the claim stays true rather than nearly true: Connect (marketplaces,
`application_fee_amount`, `transfer_data`), Radar, Terminal, Issuing, Stripe Tax,
the Billing Portal, `balance` and payouts, and any code reading Stripe-internal
fields we cannot fill — `charges.data[0].balance_transaction`,
`payment_method_details.card.*`. All of it throws, by name, with the reason.

## Design

**IDs.** `cus_` + the UUID hex without dashes, reversible in-process, no storage;
raw UUIDs also accepted so both SDKs can run side by side during a migration.
Imported IDs resolve differently: the decoder tries hex first, then falls back to
lookup by `externalId` / `products.key`, which is what makes their `cus_1Abc…`
work unchanged. Prefixes: `cus_ in_ pi_ re_ sub_ prod_ price_ cs_ pm_ evt_`.

**Money.** Integer minor units ↔ decimal string, by **string shift only** — no
`Number` arithmetic anywhere in `money.ts`; `1050 / 100` is exact today and stops
being exact the day someone adds a percentage. Property-tested both ways.
Exponent≠2 currencies (`JPY`, `CLP`, `KRW`) throw: `moneyPlaces` is hardcoded to 2
backend-side while three `currency CHAR(3)` columns accept anything
(`initiatives/billing/tasks.md` §7), so `unit_amount: 100, currency: "jpy"` would
quietly become R$ 1,00.

**Lists.** `limit` and the `{ object: "list", data, has_more, url }` envelope work
— fetch `limit + 1`, drop the extra. `starting_after` / `ending_before` throw:
offsets cannot honestly emulate cursors under concurrent inserts, and a pagination
loop that silently repeats or skips a page is worse than one that fails on call
two.

**Errors.** `InfiError` → the Stripe shape (`type`, `code`, `param`, `message`,
`request_id`) with `instanceof`-compatible classes under `Stripe.errors.*`. The
original stays at `err.raw.infi`; a translation layer that loses the underlying
error doubles the length of every incident.

**`apiVersion`.** Accepted and recorded, never rejected — every app pins one. We
pin our shapes to a single documented Stripe version and say which.

**Events**, translated 1:1 (`invoice.paid` is already emitted separately from
`payment.confirmed` — `internal/payment/service.go:1491` and `:1497` — so
synthesising it would double-fire a handler that was already correct):

| Infi | Stripe |
|---|---|
| `customer.created` | `customer.created` |
| `invoice.finalized` / `.sent` / `.paid` / `.voided` | same |
| `invoice.uncollectible` | `invoice.marked_uncollectible` |
| `payment.confirmed` | `payment_intent.succeeded` |
| `payment.failed` | `payment_intent.payment_failed` |
| `payment.canceled` | `payment_intent.canceled` |
| `payment.refunded` | `charge.refunded` |
| `payment.chargeback` / `.chargeback_reversed` | `charge.dispute.created` / `.closed` |
| `checkout_session.*` | `checkout.session.completed` / `.expired` |
| everything else | passed through as `infi.<name>` |

That last row matters: an unmapped event is **delivered under an `infi.` prefix**,
never dropped, so a handler's `default:` branch is how somebody finds out the map
is incomplete.

**Resources.** `customers`, `products`, `checkout.sessions` (`success_url` /
`cancel_url` map straight onto `CreateInvoiceRequest.successUrl`/`cancelUrl`),
`invoices`, `subscriptions`, `refunds`, `paymentMethods` map cleanly.
`paymentIntents.create/retrieve/cancel` differ — Pix arrives as `next_action`.
`prices` is the hard one (§2). `events.list` depends on whether
`/account/webhooks/deliveries` carries enough; if not, it throws in v1.

## The route

Ordered so the parts that can kill the claim fail first, and so the demo exists
before the surface is wide. TDD throughout — the failing test first, and seen
failing.

0. **Prove the claim can hold at all.** Take the target `stripe-samples/` app and
   list every Stripe call and field it touches. That list, not our taste, is v1's
   scope. If `price_…` resolution is not solved for it, nothing downstream matters.
1. **`ids.ts`, `money.ts`, `errors.ts`** with property tests.
2. **`infi migrate-from-stripe`** + the `stripe-map.json` bridge. Before the
   surface, because the surface is untestable against their IDs without it.
3. **`customers`, `products`, `checkout.sessions`.**
4. **`Stripe-Signature` on the backend**, then `webhooks.constructEvent` verified
   against a payload signed by `signer.go` itself, not a reimplementation.
5. **The demo.** Steps 2–4 are the sample's whole surface: run it, pay with Pix,
   film it. Everything after is widening, not proving.
6. **`stripe-js-compat`** — the Elements redirect shim.
7. **`paymentIntents`, `invoices`, `subscriptions`, `refunds`.**
8. **`unsupported.ts` + the guard test**: one registry of what throws, and a test
   walking the `stripe` package's own type surface asserting every method is
   implemented or registered. Cheap, and the only thing that keeps the matrix true
   after the third contributor.
9. **README + a matrix generated from the code**, so a stale matrix is a failing
   build rather than a support ticket.

## Backend work this depends on

Not "gaps to check" — three of these are required for the goal as stated.

- `[be]` **`Stripe-Signature` header**, additive (§4). Required.
- `[be][schema]` **`metadata` on invoices, products, prices** (§3). Required.
- `[be][schema]` **`prices.key`** and a way to name a version's `basePrice` (§2).
  Required for the real version; `stripe-map.json` buys time.
- `[be]` Customer lookup by email — the Stripe get-or-create idiom.
- `[be]` `Idempotency-Key` on invoice create and charge; `stripe-node` sends it on
  everything and expects replay safety.
- `[be]` `items[]` on subscription create (already open in
  `initiatives/billing/tasks.md` §6).

## Decisions that are not mine

- **The name.** `@beinfi/stripe-compat` is nominative use of someone else's mark.
  The scope is ours and the README carries a "not affiliated with Stripe, Inc."
  line with no Stripe branding — but whether the word appears in the published
  name is a business call.
- **Reading their Stripe account.** `migrate-from-stripe` asks the merchant for a
  Stripe secret key. That is the most sensitive credential they have, and how we
  take it (never stored, client-side only, read-only restricted key) is a trust
  decision before it is a technical one.
- **Whether it goes on the landing**, or ships on npm and is sold quietly to the
  segment above. Same code, very different exposure.

## Verification

The mission's four surfaces — their console, their database, our dashboard, their
Asaas account — and none of them is the test suite. Green tests are necessary and
nowhere near sufficient: a compat layer's characteristic failure is a call that
returns a plausible object and did the wrong thing, which is exactly what a test
written from the same wrong assumption confirms.
