# @beinfi/checkout

Infi checkout, embedded in your own page. The buyer pays with pix, card or crypto
without ever leaving your site.

```bash
npm install @beinfi/checkout
```

```tsx
import { InfiCheckoutEmbed } from "@beinfi/checkout/react";

<InfiCheckoutEmbed
  linkToken="plink_…"
  environment="sandbox"
  onComplete={({ invoiceId }) => router.push(`/obrigado?i=${invoiceId}`)}
/>
```

One prop. The token is globally unique and carries its own tenant, so it
identifies the merchant on its own — no slug needed. Pass `slug` alongside it if
you want the backend to cross-check the two.

That is the whole integration. No API key reaches the browser, and there is no
server call per purchase — the `plink_…` payment-link token is the capability,
the same way a Stripe price id or a Whop plan id is.

## Two things to know before you ship

**`onComplete` is not proof of payment.** It is a client-side event on a page you
control, so it can be faked and it can be missed. Change the screen with it;
**ship the goods when the `payment.confirmed` webhook arrives**, verified with
`verifyWebhook` from `@beinfi/sdk`.

**You are embedding our checkout, not composing it.** Theming is a documented set
of knobs — `theme`, `themeOptions.accentColor`, `themeOptions.backgroundColor`,
`locale`, `hidePrice` — not your own CSS. Card fields are rendered by the payment
provider inside their own frame, which is what keeps card data off your site and
your PCI scope unchanged.

## After the payment

Two ways to react, and you can use either or both.

**Stay on the page.** Handle `onComplete` and change the screen yourself:

```tsx
<InfiCheckoutEmbed
  slug="acme"
  linkToken="plink_…"
  environment="production"
  onComplete={({ invoiceId }) => setStep("thanks")}
/>
```

**Send the buyer somewhere.** Pass `returnUrl` and the embed navigates the top
window to it with the outcome appended — `?status=success` or `?status=error`,
so your post-payment code branches the same way it would after any redirect.
Query params you already have are preserved, and a relative path resolves
against the current page:

```tsx
<InfiCheckoutEmbed … returnUrl="/obrigado?order=42" />
// → /obrigado?order=42&status=success
```

`skipRedirect` keeps the buyer put even with `returnUrl` set, for when you want
the URL recorded as a fallback but intend to react in `onComplete`.

## One product, or a cart

| | `linkToken` | `invoiceId` |
|---|---|---|
| Products | one | many — cart, custom amounts |
| Server call per purchase | none | one, with your secret key |
| The identifier is | static, public, reusable | per purchase |

For a cart, price it on your server — amounts are never settable from a browser:

```ts
const { invoiceId } = await infi.checkout({ slug, payerId, lineItems });
```

```tsx
<InfiCheckoutEmbed slug="acme" invoiceId={invoiceId} environment="production" />
```

You can also pass the URL `links.create()` gave you and skip the other props:

```tsx
<InfiCheckoutEmbed href={link.url} environment="production" />
```

## Collect the CPF/CNPJ

Pix and boleto are refused for a payer without one. In link mode the checkout
asks for it. In invoice mode there is no contact step, so it has to be on the
customer when your server creates the invoice — otherwise the charge fails in
front of the buyer and the embed cannot recover it.

## Driving it yourself

```tsx
const checkout = useCheckoutEmbedControls();

<InfiCheckoutEmbed ref={checkout} … />
<button onClick={() => checkout.current?.submit()}>Pagar</button>
```

`submit()`, `getEmail()`, `setEmail()`, `getTaxId()`, `setTaxId()`.

## Without a build step

Framer, Webflow, WordPress, a hand-written page — paste two things:

```html
<script async defer src="https://app.beinfi.com/checkout/v1/loader.js"></script>

<div
  id="checkout"
  data-infi-checkout-link-token="plink_…"
  data-infi-checkout-environment="production"
></div>
```

Every React prop has a `data-infi-checkout-*` twin: `link-token`, `invoice-id`,
`slug`, `href`, `environment`, `locale`, `theme`, `theme-accent-color`,
`theme-background-color`, `hide-price`, `prefill-email`, `prefill-name`,
`prefill-tax-id`, `return-url`, `skip-redirect`, `app-url`.

Callbacks name a function on `window`:

```html
<script>
  window.onDone = (payload) => console.log(payload);
</script>
<div … data-infi-checkout-on-complete="onDone"></div>
```

Also `on-state-change`, `on-payment-pending`, `on-payment-error`. A name that
does not resolve to a function is warned about in the console rather than
dropped — that typo is otherwise indistinguishable from a checkout that never
completed.

Drive it from your own button through the global:

```js
infiCheckout.submit("checkout");
await infiCheckout.getEmail("checkout");
infiCheckout.setTaxId("checkout", "52998224725");
```

Elements added to the page later are picked up automatically, which is what
makes this work in page builders that inject DOM after load. `environment` has
no default: a missing one refuses to mount rather than guessing production.

## Without React


```ts
import { createCheckoutEmbed } from "@beinfi/checkout";

const embed = createCheckoutEmbed(
  document.getElementById("checkout")!,
  { slug: "acme", linkToken: "plink_…" },
  { mode: "sandbox", onComplete: (p) => console.log(p) },
);
```

## Testing

Use `environment="sandbox"` and a `sk_test_` link. A sandbox pix charge is driven
to paid from the confirmation page the QR points at — no provider credential
needed. The embed's own poll flips it to a receipt; nothing to reload.
