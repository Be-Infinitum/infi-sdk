---
name: embed-checkout
description: Take pix, card or crypto payment on the user's own page with an embedded checkout — no redirect, no card fields in their DOM, no API key in the browser. Use when the buyer must stay on the site instead of being sent to a hosted payment link.
---

# Embedded checkout with Infi

One component, one iframe. The buyer pays without leaving the page.

```bash
npm install @beinfi/checkout
```

```tsx
import { InfiCheckoutEmbed } from "@beinfi/checkout/react";

<InfiCheckoutEmbed
  href={link.url}
  environment="sandbox"
  onComplete={() => setStep("thanks")}
/>
```

That is the whole integration. No API key in the browser, and no server call per
purchase — the `plink_…` payment-link token *is* the capability, like a Stripe
price id or a Whop plan id.

Sibling skills: `send-payment-link` if the buyer can be sent a URL (build
nothing at all), `sell-digital-product` for the thank-you page and delivery.

## The two things to get right

### 1. `onComplete` is not proof of payment

It is a client-side event on a page the merchant controls, so it can be faked
and it can be missed — a closed tab, a dead connection, a buyer who pays the Pix
an hour later. Use it to change the screen. **Fulfil on the webhook:**

```ts
// POST /api/webhooks/infi — your server, raw body
const event = infi.verifyWebhook(
  {
    id: req.headers["x-webhook-id"],
    timestamp: req.headers["x-webhook-timestamp"],
    signature: req.headers["x-webhook-signature"],
    eventType: req.headers["x-webhook-event-type"],
    body: rawBody, // exact bytes — a re-serialized JSON will not verify
  },
  process.env.INFI_WEBHOOK_SECRET!,
);
if (event.type === "payment.confirmed") await fulfil(event.data);
```

`payment.confirmed` is the one to key on; `checkout.session.completed` fires for
the link flow too. Declare it in `infi.company.ts` (`webhooks: [{ url, events:
["payment.confirmed"] }]`) and `infi sync` registers it.

Fulfilment wired to `onComplete` passes every test anyone runs by hand and then
ships goods for money that never settled — and misses the buyers who paid after
closing the tab. It is not a race to tighten; it is the wrong event.

### 2. The slug travels with the token

The `plink_…` token resolves the tenant on the backend, but the page the iframe
loads is `/pay/{slug}/links/{token}` and **there is no slug-less route**. So
`linkToken` alone is not enough:

```tsx
<InfiCheckoutEmbed slug="acme" linkToken="plink_…" environment="production" />
```

Prefer not caring. `links.create()` returns `{ ...link, url }` and `href` parses
that string back into slug + token, so hand back exactly what the SDK gave you:

```tsx
<InfiCheckoutEmbed href={link.url} environment="production" />
```

A missing slug throws `InvalidEmbedUrlError` rather than loading a URL with
`undefined` in it, so this fails on your keyboard, not in front of a buyer.

## Getting the link (there is usually nothing to create)

Every published product already has a payment link. List before you create:

```ts
const [link] = await infi.links.list(productId, { slug });   // url is filled in when slug is passed
const fresh = link ?? (await infi.links.create(productId, { slug }));
```

`links.list()` without a `slug` returns `url: ""` — never a broken URL, but not
one you can embed either. A product with no published version cannot be sold at
all; `infi bootstrap --intent one-time` publishes for you.

## One product, or a cart

| | `linkToken` / `href` | `invoiceId` |
|---|---|---|
| Products | one | many — cart, custom amounts |
| Server call per purchase | none | one, with `sk_…` |
| The identifier is | static, public, reusable | per purchase |

A link is one product — `payment_links.product_id` is singular — and a cart is
not expressible as one. Price the cart on your server and embed the invoice:

```ts
const { invoiceId } = await infi.checkout({ slug, payerId, lineItems });
```

```tsx
<InfiCheckoutEmbed slug="acme" invoiceId={invoiceId} environment="production" />
```

**Amounts are never settable from a browser.** There is no `amount` or `price`
prop, and asking for one means you want the invoice mode.

**The CPF/CNPJ asymmetry, which bites in invoice mode.** Pix and boleto refuse a
payer without one. In link mode the checkout collects it. In invoice mode there
is no contact step — the customer was created on your server — so it must be on
that customer, or the charge fails in front of the buyer and the embed cannot
rescue it:

```ts
await infi.checkout({ slug, productId, customer: { externalId, email, taxId: "52998224725" } });
```

## `environment` has no default

`"sandbox"` or `"production"`, always explicit. Defaulting to production is how
a test integration quietly charges live cards, so the prop is required and there
is no fallback to guess wrong with. It also selects the host — never hardcode
`app.beinfi.com`.

## Theming is a set of knobs, not your CSS

The merchant is embedding our checkout, not composing it out of their own
components. What crosses the boundary is documented and small: `themeOptions`
(`accentColor`, `backgroundColor` — `#rgb`/`#rrggbb` only, anything else
throws), `locale`, `hidePrice`, `theme`, plus `className` / `style` on the host
element. There is no stylesheet injection and no slot for a custom layout. Say
this before it is discovered in staging; if the design has to be theirs pixel
for pixel, this is the wrong product and `send-payment-link` is the honest
answer.

`theme` takes `light | dark | system` and **only `light` is honoured today** —
the checkout surface has no dark palette yet, so `dark` is accepted, recorded
and renders light. Do not sell a dark checkout on the strength of the prop.

`locale` must be passed for a non-default language: the checkout's locale cookie
is `SameSite=Lax`, so it never reaches a third-party frame and the embed falls
back to `Accept-Language` without it.

Card fields are rendered by the payment provider inside their own frame, nested
in ours. Card data never touches the merchant's site and their PCI scope does
not change.

## After the payment

Either, or both:

- Stay put — handle `onComplete` and swap the screen yourself.
- `returnUrl="/obrigado?order=42"` — the embed navigates the **top** window and
  appends `?status=success` or `?status=error`, so post-payment code branches
  like it would after any redirect. `skipRedirect` keeps the buyer on the page
  with the URL still recorded.

Other callbacks: `onStateChange(state, method)` (`loading | ready | disabled`),
`onPaymentPending({ method, paymentId, expiresAt })` — `expiresAt` is the
server's own deadline and is `null` when it gave none, so do not invent a
countdown — and `onPaymentError({ message, code })`.

## Driving it from your own UI

```tsx
const checkout = useCheckoutEmbedControls();

<InfiCheckoutEmbed ref={checkout} href={link.url} environment="sandbox" />
<button onClick={() => checkout.current?.submit()}>Pagar</button>
```

`submit()`, `getEmail()`, `setEmail()`, `getTaxId()`, `setTaxId()`, all
promises. They read and write the payer's own contact fields and press the
button the payer can already see — nothing more crosses the frame.

`submit()` rejects at the payment step by design: pix charges itself when the
buyer picks it, and the card section owns its own button inside the provider's
context. It applies to the contact step.

## Without React

```ts
import { createCheckoutEmbed } from "@beinfi/checkout";

const embed = createCheckoutEmbed(
  document.getElementById("checkout")!,
  { slug: "acme", linkToken: "plink_…" },
  { mode: "sandbox", onComplete: (p) => console.log(p) },
);
// embed.destroy() when the container goes away
```

Note `mode: "sandbox" | "live"` here, not `environment` — the React prop is the
one that takes `"production"`.

## Testing it

`environment="sandbox"` with a `sk_test_` link. A sandbox pix charge is confirmed
from the page its QR points at, with no provider credential; the embed's own poll
flips to a receipt and nothing needs reloading. `test-payment-in-sandbox` has the
CI version.

Two failures worth recognising while integrating:

- Nothing renders and the console is empty → the iframe 404'd. Check the slug,
  and check `environment` matches the key that made the link — a sandbox link does
  not resolve in production.
- `onPaymentError` with `customer_tax_id_required` → invoice mode with no CPF on
  the customer. Fix it on the server; the embed has nowhere to ask.
