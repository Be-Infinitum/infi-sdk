# Spec — Infi and mobile apps: the checkout an app can open, and the ledger behind the store's IAP

**Status:** levantamento — a survey and a draft, written for review before the detailed spec.
Two parts, deliberately in one file because a merchant with an app will do both. **Part I** is
Infi as the payment *instead of* the store's In-App Purchase — Pix and card, where the store
allows it. **Part II** is Infi as the ledger *behind* IAP — the wallet, the meter, the
subscription state and the webhook, when Apple or Google collect the money. Verified against the
three repos on disk and public store sources on 2026-09-05.

## Context

A merchant with a **mobile app** has no path into Infi today. Every surface we sell assumes one
of two places: a browser on the merchant's own web origin (`@beinfi/checkout`, an iframe) or a
full-page hosted checkout on ours (`/pay/{slug}/…`). The three repos, the six ADRs in this one and
the `initiatives/` folder contain **zero** occurrences of React Native, Expo, Flutter, WebView,
deep link, universal link, app store, StoreKit or Play Billing. Not a gap we chose; a gap nobody
has looked at.

It matters because the merchants Infi is built for — technical founders selling AI credits,
usage SaaS, digital products, workshops, services — ship apps. And Brazil is a phone-first
market where the dominant payment method, Pix, is *itself* an app-switch: the buyer copies a
code, opens their bank, pays, comes back. A checkout that lives in a mobile app is where Pix is
most at home, and we are absent from it.

The good news, and the reason Part I is shorter than it could be: **most of what a mobile app
needs already exists**, and the one thing the backend already refuses turns out to be the right
refusal. Part II is genuinely new — and it is the part that makes Infi different from a payment
button, because IAP has no meter, no wallet and no usage billing, and Infi is all three.

## The market, cut where the rules cut it

Mobile is not one segment. The app stores split it for us, and the split decides what Infi can
promise.

| Segment | What the stores say | What it means for Infi |
|---|---|---|
| **(1) Physical goods and real-world services**, consumed outside the app — delivery, bookings, classes, a workshop, a marketplace of service pros, field sales | Apple **3.1.3**: must use payment methods *other than* In-App Purchase. Google Play: same carve-out. **No commission, no enrollment, no entitlement.** | The clean target for Part I. Pix in-app, card via the provider's frame, zero platform friction. |
| **(2) Digital goods and subscriptions** consumed in the app — AI credits, SaaS plans, content, features | Historically IAP-only (3.1.1). **Brazil changed in 2026**: CADE approved Apple's settlement on 2025-12-23 and Apple shipped the changes with iOS 26.5 on 2026-06-18 — an app may offer an alternative payment method in-app and/or link out to a website, **alongside** IAP. Apple takes 15% on a linked-website transaction (10% reduced tier), against 21% + 5% processing for IAP; static text that steers with no link is 0%. Google Play: Brazil is in **User Choice Billing** (non-gaming apps), 4% off the service fee, and the developer must integrate the alternative-billing APIs and **report every transaction**. | Two doors, both ours. Part I where the storefront allows an alternative; **Part II everywhere**, because IAP still happens — by choice, by convenience, or because the storefront is not Brazil — and the credits it buys still need a ledger. |
| **(3) Mobile web / PWA** | No store, no rules | Already served. The hosted page and the embed are responsive. Nothing to build; one thing to verify (320px). |

The number that makes segment (2) real: a merchant on Infi Managed pays 5% + R$ 0,70 (on its
branch, not merged) or their own PSP's rate under BYOP. Plus Apple's 15% on a link-out, that is
still under the 26% Apple charges for IAP on the same sale — and on Android the same sale costs
4% *less* than Play Billing. The economics favour us in Brazil for the first time. The rest of
the world still says IAP, and the skill must not pretend otherwise — which is exactly why Part II
exists.

---

# Part I — Infi as the payment: the checkout an app can open

## The claim

A merchant's React Native app calls one function with the URL `links.create()` already
returned, and the buyer pays with Pix in a browser sheet, switches to their bank, comes back, and
lands in the app on a screen the merchant chose — with no key in the app binary, no new backend
route, and the webhook their server already has firing exactly as it does on the web.

Then, one release later, the same app renders the same checkout **inside** a screen it owns,
with the same callbacks the web embed has, over the same protocol.

## Design principles

- **No key in the app binary.** An app binary is a public artefact more than a web page is: it
  is downloaded, unpacked and grepped. The `plink_` token stays the whole capability, exactly as
  on the web. `pk_` is not needed for any phase here, and nothing accepts one anyway.
- **The protocol is the contract; the transport is a detail.** `checkout/v1` imports nothing and
  says so in its first comment. A WebView is a third transport for the same messages, not a
  second protocol.
- **A return into an app is an `https` URL the merchant owns.** Universal Links and App Links,
  never a custom scheme. The backend already enforces this and must keep enforcing it.
- **`onComplete` is not proof of payment** — on mobile it is *less* proof, because the buyer
  left for their bank app and may come back an hour later or never. Fulfil on
  `payment.confirmed`. Said on the first screen of the skill.
- **Native card capture is refused.** The provider fork (`stripe_payment_intent | adyen_session`)
  is a seam the PCI vault is about to remove; freezing it into app binaries that update on a
  store review cycle is how a one-line backend change strands a merchant's users on an old
  build. Card stays in a web surface. Pix, which is an EMV string and a poll, may go native.
- **The store's rules are the merchant's obligation, and the skill asks about them first.** An
  app rejected in review for 3.1.1 is our onboarding failure even though it is not our rule.

## Verified facts (design constraints)

| Fact | Where |
|---|---|
| Zero mobile prior art in `infi-sdk`, `backend`, `frontend`, `initiatives` | exhaustive grep, 2026-09-05 |
| `successUrl` / `cancelUrl` must be **absolute, `http` or `https`, no credentials, ≤ 2048 chars** — a custom scheme (`meuapp://`) is a 422 | `backend/internal/platform/returnurl/returnurl.go:31-47` |
| The frontend mirrors that guard before any `location.assign` | `frontend/src/lib/checkout/return-url.ts:10-20` |
| Both surfaces append the outcome the same way: `?status=success&invoice=…` or `?status=error&code=…`, preserving the merchant's own query params | `return-url.ts:30`, `packages/checkout/src/core.ts` `withStatus` |
| `successUrl` exists on both entry modes: on the link (`links.create()`) and on the invoice (`infi.checkout({ successUrl })`) | `packages/sdk/src/resources/links.ts:15-20`, `client.ts:66,359` |
| The child bridge speaks **only** to `window.parent`, and goes silent when it *is* the top window — which is what a WebView makes it | `frontend/src/components/embed/use-embed-bridge.ts:47` `if (window.parent === window) return;` |
| The parent validates `event.source`, then `event.origin`, then the envelope. A WebView host has none of those; it has the page URL on each message | `packages/checkout/src/core.ts` `onMessage` |
| `protocol.ts` has zero imports — no DOM, no React, no Node — and is byte-identical in two repos by rule | `packages/checkout/src/protocol.ts:1-10` |
| `@beinfi/checkout` core is DOM-only: it does `document.createElement("iframe")` | `core.ts` `createCheckoutEmbed` |
| `@beinfi/sdk`'s root entry imports `node:crypto`, so it **cannot be bundled by Metro** into an app — and should not be, it carries `sk_` | `packages/sdk/src/webhooks.ts:1`, `packages/checkout/src/hosts.ts:5-8` |
| `PayResource` is public and keyless; its "does not run in a merchant's page" limit is **CORS**, which native HTTP stacks (NSURLSession, OkHttp, Dart `http`) do not enforce. It wraps invoice read, charge, coupon and `waitForPaid` — and **not** the link session routes | `packages/sdk/src/resources/pay.ts:58-70` |
| The link session routes exist and are keyless: `POST …/links/{token}/sessions`, `…/sessions/{id}/charge`, `…/sessions/{id}/payments/{paymentID}` | `backend/api/openapi.yaml:512,699,754,778` |
| **No route accepts a `pk_` today**; the scope ceiling (`checkout:read`, `checkout:write`, `catalog:read`) exists ahead of the first route that opts in | `backend/internal/auth/authz.go:60-121` |
| `Surface` is a closed set `hosted \| embed` choosing a PSP return-path template; not a security boundary | `backend/internal/payment/surface.go` |
| The checkout has **no Apple Pay / Google Pay code at all** — zero hits | grep `frontend/src/components/checkout`, `src/lib/checkout` |
| Apple Pay JS runs in Safari and `SFSafariViewController`, **not** in `WKWebView` | Apple Developer Forums, threads 714877 / 685770 |
| The receipt already calls `navigator.share`, which on a phone is the system share sheet | `frontend/src/components/checkout/receipt-share-bar.tsx:26` |
| The Pix copy is awaited and reports failure honestly; in a WebView there is no Permissions-Policy to withhold `clipboard-write` | `checkout-payment-form.tsx:70-77` |
| The `/pay/*` rate-limit finding (one global bucket without `PULSE_TRUSTED_PROXY_CIDRS`; B0–B2) predates this and every mobile checkout is another poller | `specs/checkout-embed.md` "The finding that outranks this feature" |

Read the second and sixth rows together: **the backend already refuses the one thing that would
have made mobile insecure, and already accepts the thing that makes it work.** A custom-scheme
return (`meuapp://paid`) can be claimed by any app on the device; an `https` Universal Link is
bound to a domain the merchant proves they own. `returnurl.go` was written for web open-redirect
reasons and is the correct mobile rule by accident. Keep it, and say why in a comment.

## Three shapes, compared

| | **(A) Browser sheet** | **(B) WebView + protocol** | **(C) Native UI** |
|---|---|---|---|
| How | `SFSafariViewController` / Custom Tabs opens `link.url`; the buyer returns via Universal Link | The app renders `/embed/…` in a WebView; the bridge posts to a native host instead of `window.parent` | The app draws its own screen; talks to `/pay/*` with native `fetch` |
| Key in the app | none | none | none for Pix; provider `publishableKey` for card (returned per charge) |
| Backend change | **none** | none | none (session routes exist) |
| Frontend change | none | one transport in the bridge | none |
| npm | none — or a 40-line `parseReturnUrl` | `@beinfi/checkout/native` | `@beinfi/checkout/native` `pix` module |
| Card | provider frame, full 3DS, **Apple Pay works** (Safari VC) | provider frame, 3DS overlay, no wallets | **refused** — see principles |
| Pix | copy → bank app → back; the sheet survives the switch | same, inside the app's own screen | fully native QR + copy + countdown |
| Callbacks | only the return URL | `onStateChange`, `onPaymentPending`, `onComplete`, `onPaymentError` — the web set | whatever the merchant builds |
| Whose precedent | Stripe Checkout on mobile; every OAuth flow | Whop / Stripe embedded inside WebViews | Stripe `PaymentSheet` (card), Mercado Pago (Pix) |
| Fails when | the merchant uses a custom-scheme return (422, on purpose); iOS < 17.4 for an `https` callback inside `ASWebAuthenticationSession` (fall back to Safari VC + a `Linking` listener) | the host trusts a message without checking the page URL; Apple Pay is expected | the provider fork changes under a shipped binary |

**(A) is Stripe's own recommendation for mobile Checkout**, and what a merchant who has
integrated Stripe or an OAuth login already knows. It costs us nothing on the server. It goes
first. **(B) is the embed, transported differently** — everything the web embed learned carries
over; the one new piece is that the child has to find its host when there is no parent frame.
**(C) is right for Pix and wrong for card**, and the two must not travel together as "the native
SDK".

## Recommendation, phased

### P1 — the browser sheet, and the skill that asks the right question first

No code in `backend`. No code in `frontend`. The path exists; it has never been written down.

```ts
// Server (the merchant's), once per product. The return is an https URL THEY own,
// served with apple-app-site-association / assetlinks.json — a Universal Link.
const link = await infi.links.create(productId, {
  slug,
  successUrl: "https://app.acme.com/infi/return",
  cancelUrl:  "https://app.acme.com/infi/return",
});
```

```ts
// App (Expo). Open the URL the SDK gave you; come back on your own domain.
await WebBrowser.openBrowserAsync(link.url);
// Linking → https://app.acme.com/infi/return?status=success&invoice=inv_…
// → dismissBrowser(); show "we're confirming"; your server fulfils on payment.confirmed.
```

What ships: **`skills/sell-in-mobile-app/SKILL.md`** — the store question first (below),
`onComplete`-is-not-proof restated for a buyer who left for their bank, the Universal Link return
and *why the API refuses `meuapp://`*, ten-line recipes for Expo, bare React Native, Flutter and
Swift/Kotlin, an `AGENTS.md` row. Optionally **`parseReturnUrl(url)`** in `@beinfi/checkout`, the
inverse of `withStatus`. And the readback: after the return, the app may read
`GET /pay/{slug}/invoices/{id}` — keyless, no CORS in a native fetch — to render "paid" /
"pending"; fulfilment still waits for the webhook.

*At the end of P1:* the mission runs on a phone, and an agent asked "how do I take Pix in my Expo
app with Infi" answers correctly from the skill.

### P2 — `@beinfi/checkout/native`: the embed, inside the app's own screen

**The bridge gains a host.** Chosen by the URL, not sniffed: `/embed/…?embedId=…&host=native`
(no `parentOrigin` — there is no parent). The native side injects, **before the document loads**,
one global:

```ts
window.__infiNativeHost = { post(json: string): void }
```

and the bridge calls it when `host=native`. RN's `ReactNativeWebView.postMessage`, Flutter's
`callHandler`, WebKit's `messageHandlers`, Android's `addJavascriptInterface` all reduce to *"the
host gave me a function"*. Inbound requests ride `injectJavaScript` into a receive function the
shim also exposes; `requestId`/`reply` correlation is unchanged.

**The trust check moves, it does not disappear.** A WebView host has no `event.origin`; it has
the **URL of the page that posted** (`nativeEvent.url`, `frame.request.url`). Drop any message
whose page origin is not the expected app base — a 3DS challenge may navigate the WebView to a
bank's ACS page, and that page must not be able to say `complete`.

```tsx
import { InfiCheckoutView } from "@beinfi/checkout/native";

<InfiCheckoutView href={link.url} environment="sandbox"
  onComplete={({ invoiceId }) => navigation.replace("Thanks", { invoiceId })} />
```

Same props as `InfiCheckoutEmbed` minus `returnUrl`/`skipRedirect`, plus `style`.
`react-native-webview` is an optional peer. Apple Pay and Google Pay are honestly lost in a
WebView — the checkout has neither today, so nothing regresses, but the README says it.

**Build facts to probe before writing a line:** RN's `URL`/`URLSearchParams` are historically
incomplete on Hermes and `url.ts` uses both; `./native` must not import `core.ts` (it touches
`document`); a third entry point is a third tsup config and `clean` still goes in none of them;
Flutter and Swift/Kotlin get **the protocol and shim contract documented**, not a package.

*At the end of P2:* a React Native merchant renders the checkout inside a screen they own, and a
Flutter merchant can do the same from the protocol document.

### P3 — headless Pix, native

The session routes are keyless and exist; `PayResource` never wrapped them. A `pix` module in
`./native` does: open a link session, charge `method: "pix"`, hand back `{ pixPayload,
pixExpiresAt, paymentId }`, poll the narrow payment status with the frontend's jittered, deadlined
loop — stopping on `AppState` background, reading once on foreground. The merchant renders the QR
with any library. No key, no provider, no PCI, no WebView.

**Native card stays refused** until the PCI vault lands and the provider fork is gone. Write the
refusal into the README so the request gets the reason, not a "later".

## Store compliance — what the skill asks before anything else

> **Is what you sell used inside the app?**

- **No** → Apple 3.1.3 and Google's policy *require* a non-IAP payment. Proceed; nothing to declare.
- **Yes** → the rules depend on the storefront:
  - **Brazil, iOS:** allowed since iOS 26.5 — alternative payment in-app and/or a link out,
    alongside IAP; 15% to Apple on a linked-website sale (10% reduced tier), 0% for static text.
    **Unverified:** whether Apple gates the Brazil storefront behind the external-purchase
    entitlements and the External Purchase Server API reporting the EU/US programs use. First
    thing to confirm with a real App Store Connect account.
  - **Brazil, Android:** enroll in User Choice Billing (non-gaming), offer Play Billing alongside,
    integrate the alternative-billing APIs, **report each transaction**. Registered business,
    PCI-DSS if the app handles card data (an Infi WebView does not), customer support, a dispute
    process.
  - **Anywhere else:** IAP — and Part II is the answer, not a WebView. The rejection reads "3.1.1".

The skill is a decision tree before it is a recipe. And the Brazilian rules put a merchant's
*Infi* checkout on the same screen as Apple's IAP sheet for the first time: the buyer sees the
price difference, and the merchant will want Pix there because it is the method Apple cannot
offer.

---

# Part II — Infi as the ledger: when the store collects

## The claim

A merchant sells a consumable "50 000 tokens" through Apple's In-App Purchase. Apple's server
notification lands on Infi; the buyer's wallet credits; the app's next request meters against it.
A second buyer bought the same 50 000 tokens on the web with Pix. Both appear in one
`customers.state`, both fired the merchant's `payment.confirmed` handler — one with `provider:
"app_store"`, one with `provider: "asaas"` — and the merchant wrote that handler once.

Three months later Apple sends a `CONSUMPTION_REQUEST` because that buyer asked for a refund.
Infi answers it from the meter: 41 200 of 50 000 tokens were used.

## Why this is Infi's shape and not RevenueCat's

RevenueCat and its peers answer *"is this user subscribed?"* from receipts, and sell paywall UI
and conversion analytics on top. That is a solved market and not ours.

IAP has **no usage billing**. There is no post-paid, no metered price, no rate card, no
overage — Apple and Google sell fixed SKUs, consumable or renewing. So an AI app that wants to
charge by the token inside the store's rules has exactly one shape available: **prepaid credits
bought as consumables, drawn down by a meter the store knows nothing about.** That meter, that
wallet, the grants a subscription renews, the state read the app's backend needs — that is what
Infi already is (`infi.wallet`, `infi.meter`, `grants: [{ on: "cycle" }]`, `customers.state`).
Part II is not a new product; it is a third way money arrives at the product we have.

And it is the piece that makes Part I's Brazil economics *usable*: a merchant can sell through
IAP for convenience and steer to Pix on the web for margin — static text, 0% — because both land
in the same ledger and the app cannot tell which door the credits came through.

## The provider that only observes

This backend already has a provider that cannot move money. The crypto path *"observes a
transfer already made from the merchant wallet; it cannot sign or initiate one on Infi's behalf"*
(`internal/payment/gateway.go:322`). `WebhookEvent` is already provider-neutral, and already
carries `Fees` — *"settlement fees, when the PSP reports them"* (`gateway.go:326-345`).

An app store is that kind of provider, taken further: it cannot charge, cannot refund on our
instruction, cannot be routed to. It **tells us** about transactions it settled, signed, and we
materialize what they mean. Two adapters, each implementing only the observation half of the
port:

| | App Store | Google Play |
|---|---|---|
| Push | App Store Server Notifications V2 — a JWS whose `x5c` chain must verify to Apple Root CA G3 and carry the App Store signing OID; inside, `signedTransactionInfo` and `signedRenewalInfo`, each a JWS again | Real-Time Developer Notifications over Pub/Sub — a pointer, not the fact |
| Pull / readback | App Store Server API (transaction history, `sendConsumptionInformation`) with an in-app purchase key (`.p8`) | Google Play Developer API `purchases.subscriptionsv2.get`, `purchases.products.get`, plus **acknowledge**, with a service account |
| Who is the buyer | `appAccountToken` — a UUID the app sets at purchase time | `obfuscatedExternalAccountId` — a string the app sets at purchase time |
| Which product | `productId` (the store SKU) | `productId` / `basePlanId` / `offerId` |
| Which merchant | bundle id, registered on the tenant when the store is connected | package name, same |
| Must we act | answer `CONSUMPTION_REQUEST` within 12 hours, or Apple decides without us | **acknowledge within 3 days or the purchase is refunded** (re-verify in Play Billing docs) |

**Connecting a store is a provider connection.** Same door as connecting Stripe or Asaas —
dashboard, fresh MFA, never a key (`AGENTS.md` §"Payment providers"). It does not decide where
money goes, but it holds a credential that can read every transaction and answer refund
questions, and it is the store's identity for our tenant. One door for all providers, or the
exception becomes the rule.

## What a notification materializes

The store's event describes a transaction **we never opened**. So the pipeline is identify, then
materialize, then emit — and every step reuses something that exists:

1. **Tenant** from the bundle id / package name on the connection.
2. **Product** from the store SKU → Infi product mapping declared in company-as-code (below). An
   unmapped SKU is stored and surfaced in the dashboard as *"a sale you have not told us about"*,
   never dropped.
3. **Customer** from `appAccountToken` / `obfuscatedExternalAccountId` → `externalId`. Apple's is
   a UUID; Infi's `externalId` is any string. Either the merchant's ids are UUIDs already, or the
   merchant's server registers the token ↔ id pair before the purchase — a decision, below.
4. **Enrollment** via `EnrollForPurchase(externalID, …)` (`internal/invoice/service.go:371`) —
   the same call a payment link makes.
5. **Invoice, created and settled in one transaction**, `Fees` = the store's commission (so the
   ledger shows net, and reporting does not overstate revenue). This is *not* the sandbox
   `markInvoicePaid` route, which *"must be absent in live"* (`sandbox_handler.go:25-30`); it is
   a provider settlement with a real external reference, through the same store path a PSP
   webhook takes (`service.go:1474-1547`).
6. **Grants fire** — `on_event=payment` for a consumable (ADR 0021), `on: "cycle"` for a
   renewal — exactly as they do for Pix. The wallet credits. Nothing about the meter changes.
7. **`payment.confirmed`** with `customerId` and `payerId`, which the payload already carries
   (`event_payload.go:18-27`), plus a `provider` field. One handler on the merchant's side.

**Lifecycle, mapped once and tested once:**

| Store says | Infi does |
|---|---|
| Apple `SUBSCRIBED` / `DID_RENEW`; Play `SUBSCRIPTION_PURCHASED` / `_RENEWED` | settle the period's invoice, run cycle grants |
| Apple `DID_FAIL_TO_RENEW` (billing retry / grace); Play `_IN_GRACE_PERIOD` / `_ON_HOLD` | subscription state `past_due`-equivalent in `customers.state`; grants **not** revoked while in grace — the store is still trying |
| Apple `EXPIRED`; Play `_EXPIRED` / `_CANCELED` at period end | subscription ends; no new grants |
| Apple `REFUND` / `REVOKE`; Play `_REVOKED`, `ONE_TIME_PRODUCT_CANCELED` | `payment.refunded`; revoke the grant — debit what remains, and **decide** whether a wallet may go negative (below) |
| Apple `CONSUMPTION_REQUEST` | answer from the meter: `consumptionStatus` from balance vs. grant. This is the one place Infi knows something Apple does not |
| Apple `DID_CHANGE_RENEWAL_STATUS`, `OFFER_REDEEMED`, `PRICE_INCREASE`; Play `_PRICE_CHANGE_CONFIRMED`, `_DEFERRED` | recorded on the subscription; no money movement |

Also **ingest, not only listen**: `POST /iap/app-store/transactions` and `/iap/play/purchases`
taking a signed transaction / purchase token from the merchant's server. Notifications can be
missed, and an app's first launch calls `Transaction.currentEntitlements` / `queryPurchases` and
wants the ledger to agree with the device. Same pipeline, same idempotency on the store's
transaction id.

## Company as code reaches the stores

```ts
export default defineCompany({
  products: [
    { key: "credits-50k", name: "50 000 tokens", type: "item", pricingModel: "prepaid",
      grants: [{ meter: "tokens", amount: "50000", on: "payment" }],
      store: {
        appStore: { productId: "com.acme.credits50k", kind: "consumable" },
        play:     { productId: "credits_50k" },
      } },
    { key: "pro", name: "Pro", pricingModel: "subscription",
      grants: [{ meter: "tokens", amount: "200000", on: "cycle" }],
      store: {
        appStore: { productId: "com.acme.pro.monthly", kind: "auto_renewable" },
        play:     { productId: "pro", basePlanId: "monthly" },
      } },
  ],
});
```

**IAP-1 — the mapping only.** `infi sync` records which store SKU is which Infi product. The
merchant still creates the SKU in App Store Connect and Play Console by hand. This is what step 2
above reads.

**IAP-3 — `infi sync` writes the SKU.** Both stores have the API: App Store Connect
`POST /v2/inAppPurchases` and the subscription/price-point endpoints; Google Play Developer API
`monetization.onetimeproducts` and `monetization.subscriptions.create` (the old `inappproducts`
API is deprecated for subscriptions since 2024). Company-as-code becomes Terraform for IAP
catalogs — declared once, synced to Infi, Apple and Google, `--plan` before `apply`, like every
other declared field. The costs are real and specific: Apple prices are **territory price
points**, not amounts, so the file names a tier or a reference price and the plan shows what each
territory resolves to; IAP metadata goes through App Store review; sandbox lags up to an hour.
It is the most on-brand thing in this document and the last thing to build.

## Nota fiscal and tax — open, and a rule in the meantime

Apple's terms name Apple as merchant of record for VAT in Brazil and a Brazilian "Collection
Entity" that withholds at source; they also say the developer is *"solely responsible for any
indirect tax liability"* on their side. Whether a Brazilian developer issues a nota fiscal for
an IAP sale — to whom, for what amount, gross or net of commission — is a legal question this
survey does not answer.

The rule until it is answered: **an invoice settled by a store is flagged `settledBy:
app_store | play` and excluded from fiscal-document generation by default.** `billdoc` renders
receipts and invoices today; a receipt for a sale Apple collected, with Apple's name absent and a
gross amount the merchant never received, is worse than none. Opt-in later, once someone who can
sign says what the document should say.

## Phasing

**IAP-1 — the ledger.** Connect App Store / Play (dashboard, MFA, credentials stored like a
PSP's). `store` mapping in company-as-code. Notification endpoints with full JWS / Pub-Sub
verification, plus the ingest endpoints. Materialize consumable → wallet credit and subscription
→ enrollment + cycle grants. `payment.confirmed` gains `provider`. Refund → revoke.

*Mission:* an Xcode StoreKit sandbox purchase of "50 000 tokens" in a test app → the balance
rises in the dashboard → a metered call draws it down → the merchant's webhook log shows
`payment.confirmed` with `provider: "app_store"` → a sandbox refund → `payment.refunded` and the
balance falls. Seen in four places: the phone, the dashboard, the webhook log, the wallet ledger
rows.

**IAP-2 — the obligations.** Acknowledge Play purchases from Infi (so a merchant who forgets does
not refund every sale on day 3). Answer Apple's `CONSUMPTION_REQUEST` from the meter. Grace, hold
and billing-retry states legible in `customers.state`. The unmapped-SKU screen.

**IAP-3 — the catalog.** `infi sync` creates and updates SKUs in both stores.

## What Infi is not, here

**A paywall SDK.** No purchase UI, no A/B tests, no conversion funnels. The merchant uses StoreKit
2, Play Billing Library, `expo-iap` or `react-native-iap` directly; we take the server side.

**A receipt validator for apps with no server.** The app cannot hold an `sk_`; the merchant's
server ingests, or the store notifies. Both exist; a third, keyless door from the device does not.

**Merchant of record, tax agent, or the issuer of anyone's nota fiscal.**

**Payout reconciliation** against Apple's and Google's financial reports. `Fees` on the event
gives net-per-transaction; matching that to a monthly remittance is accounting, later or never.

**A wallet that silently goes negative** — unless decided below.

## Verified facts, Part II

| Fact | Where |
|---|---|
| `WebhookEvent` is provider-neutral and carries `Fees` — *"settlement fees, when the PSP reports them"* | `backend/internal/payment/gateway.go:326-345` |
| A provider that only *observes* money already exists: `CryptoRefundVerifier` *"cannot sign or initiate one on Infi's behalf"* | `gateway.go:319-324` |
| Marking an invoice paid without money arriving is a sandbox-only route that *"must be absent in live"* | `internal/payment/sandbox_handler.go:25-30`, `service.go:219` |
| Settlement, `markInvoicePaid`, the ledger posting and `payment.confirmed` commit in the **same transaction** | `service.go:1474-1547`, `repository.go:72-82` |
| `payment.confirmed` already carries `customerId` (enrollment) and `payerId`; `productId` is deliberately absent because grants `on_event=payment` cover crediting | `internal/payment/event_payload.go:8-27`, ADR 0021 |
| Enrollment by external id is one call, shared with payment links | `internal/invoice/service.go:371` `EnrollForPurchase` |
| `CustomerState` is one read: enrollment, every `balances[]`, `subscriptions[]`, `usage` | `api/openapi.yaml:5307-5325` |
| Grants are declared per product: `{ meter, amount, on: "cycle" }` | `packages/sdk/src/company-intents.ts:80` |
| Provider connection is dashboard-only behind fresh MFA; *"an API key can neither obtain nor replay"* the step-up token | `AGENTS.md` §Payment providers |
| App Store Server Notifications V2: `signedPayload` is a JWS; `x5c` must chain to Apple Root CA G3 with OID `1.2.840.113635.100.6.11.1`; `signedTransactionInfo` / `signedRenewalInfo` nested | Apple Developer Forums 810537 / 714870; AppsOps write-up |
| App Store Connect API creates IAPs: `POST /v2/inAppPurchases`; subscriptions via price-point resources | developer.apple.com `post-v2-inapppurchases` |
| Play: `monetization.subscriptions.create` exists; `inappproducts` deprecated for subscriptions (new apps since 2024-01-01) | developers.google.com android-publisher; Android Developers Blog 2023-06 |
| Apple is MoR for VAT in Brazil; a Brazilian Collection Entity withholds; developer *"solely responsible for any indirect tax liability"* on their side | App Store Connect tax help; Apple developer terms by region |

---

## Security (both parts)

- **Return URLs stay `https`-only.** A comment in `returnurl.go` naming the mobile reason, so a
  future "let merchants use `myapp://`" PR meets the argument at the line it would change.
- **WebView messages are trusted by page origin, or not at all.** `expectedOrigin` is
  `resolveAppBase(mode)` — never a literal host.
- **No key in the binary**, restated because every mobile SDK a merchant has seen ships one.
- **Store notifications are authenticated before they are parsed.** A JWS whose chain does not
  reach Apple's root is a 401 and a log line, never a materialized sale. Play's Pub/Sub push is a
  pointer: nothing is materialized until the Developer API confirms it.
- **Idempotent on the store's transaction id.** Apple resends; Play resends; the merchant's
  ingest endpoint and the notification race. One transaction id, one invoice, one grant.
- **Store credentials are provider credentials**: same storage, same dashboard door, same
  `infi providers verify`.
- **Polling from a phone** multiplies the `/pay/*` global bucket. B0–B2 are a prerequisite for
  Part I too.

## Verification (both parts)

None of these is the test suite. All of them are a phone.

1. **The Part I mission**, iPhone and Android, sandbox tenant, Expo app with twelve lines from
   the skill: Pix in the sheet, bank switch and back, the app opens on
   `/infi/return?status=success&invoice=…`, the webhook log shows `payment.confirmed`.
2. **The refusal:** `links.create({ successUrl: "meuapp://paid" })` is a 422 naming the field.
3. **P2 negative test:** a WebView navigated to another origin posting a perfect `complete` frame
   with the right `embedId` — `onComplete` must not fire.
4. **The Part II mission**, above, including the sandbox refund.
5. **A forged notification** — valid JSON, valid-looking JWS, wrong chain — is refused and
   nothing is written. A replayed real one is a no-op.
6. **An unmapped SKU** shows up in the dashboard, not in a log nobody reads.
7. **320px** for the hosted page and the embed. **`diff`** the two `protocol.ts` copies.

## Decisions for review

1. **Order across parts.** Part I P1 is free. Part II IAP-1 is the differentiated one and touches
   backend, dashboard and company-as-code. I would ship P1 now and start IAP-1 in the same
   quarter, before P2 — the WebView is polish; the ledger is a reason to choose Infi.
2. **Customer identity under IAP.** Require UUID `externalId`s for merchants who connect a store,
   or add a pre-purchase `registerAppAccountToken(externalId) → uuid` call on the server. The
   second is one more call; the first is a constraint on ids the merchant already has.
3. **Refund of a partly used grant.** Debit what remains and stop, or let the balance go negative
   and gate on it. Stripe-style is negative; "prepaid" in the product name argues for stopping at
   zero and telling the merchant.
4. **`parseReturnUrl` — ship or cut?** Forty lines in a package that is otherwise DOM-only.
5. **One skill or two** for Part I (physical vs. digital-Brazil), and whether Part II gets its own
   (`credits-via-iap`) — probably yes, it is a server-side recipe with no checkout in it.
6. **Where the mobile protocol lives** once a third consumer (Flutter, from the doc) exists.
7. **The Apple Brazil entitlement question** needs someone with App Store Connect. Who, when.
8. **IAP-3 at all.** Terraform for IAP catalogs is the most on-brand idea here and the largest
   surface with two external review processes in it. Decide whether it is on the roadmap or an
   aspiration named in the README.
9. **Nota fiscal for store-settled sales** needs a legal answer before the default flag flips.

## Sources

Repo facts are cited inline. Store policy and APIs, checked 2026-09-05:

- Apple Newsroom, *Apple announces changes to iOS in Brazil*, 2026-06-18 —
  https://www.apple.com/newsroom/2026/06/apple-announces-changes-to-ios-in-brazil/
- MacRumors, *New App Store fee structure in Brazil*, 2025-12-24 —
  https://www.macrumors.com/2025/12/24/new-app-store-fee-structure-in-brazil/
- Neon, *Apple's Brazil antitrust settlement* —
  https://www.neonpay.com/blog/apples-brazil-antitrust-settlement-whats-going-to-change-for-mobile-game-developers
- Apple, *App Review Guidelines* §3.1.1 / §3.1.3 — https://developer.apple.com/app-store/review/guidelines/
- Apple entitlements for external purchase (Brazil coverage **unverified**) —
  https://developer.apple.com/documentation/storekit/external-purchase
- Apple, *Create an in-app purchase* (App Store Connect API) —
  https://developer.apple.com/documentation/appstoreconnectapi/post-v2-inapppurchases
- Apple Developer Forums, ASSN v2 JWS verification — threads 810537, 714870; Apple Pay JS in
  `WKWebView` — threads 714877, 685770
- Apple, *Provide tax information* (App Store Connect help) —
  https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/
- Google Play, *Understanding user choice billing* (Brazil listed; non-gaming; 4%; APIs required) —
  https://support.google.com/googleplay/android-developer/answer/13821247
- Google Play, *Enrolling in the billing choice program* —
  https://support.google.com/googleplay/android-developer/answer/17161464
- Google Play Developer API, `monetization.subscriptions.create` —
  https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/create
- Android Developers Blog, *Changes to InAppProducts API*, 2023-06 —
  https://android-developers.googleblog.com/2023/06/changes-to-google-play-developer-api-june-2023.html
- Android Developers Blog, *Expanded billing choice and lower fees*, 2026-06 (US/EEA/UK only) —
  https://android-developers.googleblog.com/2026/06/play-expanded-billing.html
