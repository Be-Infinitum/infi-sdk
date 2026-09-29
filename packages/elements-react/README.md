# @beinfi/elements-react

```tsx
<InfiProvider slug="loja" environment="sandbox" appearance={store.appearance}>
  <StoreElement store={store} href={(p) => `/product/${p.productId}`} />
  <ProductElement product={item} href={`/checkout/${item.productId}`} />
  <CheckoutElement linkToken="plink_…" onComplete={…} />
  <PortalElement token={kept} onToken={keep} />
</InfiProvider>
```

No key in the browser: the checkout and the portal run in Infi's frames, the
store is read on your server. `onComplete` is not proof of payment — deliver
on the `payment.confirmed` webhook. Look: `appearance`, props, and CSS
(`--infi-accent`, `--infi-radius`, `--infi-border`, `--infi-muted`, `infi-store*`).

## Appearance

`appearance` takes the effective `{ accentColor, backgroundColor, font,
radius }` — what the public reads carry as `appearance` (link → product →
business, resolved by Infi) — or any subset; the old `{ theme, accentColor,
backgroundColor }` still works (`theme` is for the checkout frame). Natively
drawn elements turn it into CSS variables (`--infi-accent`,
`--infi-accent-foreground`, `--infi-background`, `--infi-foreground`,
`--infi-font`, `--infi-radius`, `--infi-button-radius`); the checkout frame
gets it in its URL. A store card and the product page take their product's
own `accentColor` on top. The elements never load a web font: the page does.

## Preview mode (the dashboard's editors)

Every element takes the same `preview` prop, an `ElementPreview` built from
the editor's draft. In preview an element is drawn here from that data and
**never calls Infi**: no `fetch`, no frame, no payment, login or access route.
No provider is needed (one only lends its appearance and locale).

```tsx
import {
  CheckoutElement, CourseElement, PortalElement, ProductElement, StoreElement,
  effectiveAppearance, previewProductFromDraft, resolveAppearance, type ElementPreview,
} from "@beinfi/elements-react";

const preview: ElementPreview = {
  product: previewProductFromDraft(draft, { id: productId, currency: "BRL" }), // GET /products/{id}/draft
  appearance: effectiveAppearance(resolveAppearance({ business, product, link })),
  merchant: { name: business.name },
  course,            // CourseElement: the CMS draft (modules → lessons)
  store,             // StoreElement: the published shelf; the draft replaces its card
  methods: ["pix", "card"], method: "pix", // CheckoutElement
};

<ProductElement preview={preview} />   // product page: gallery, FAQ, button text, accent
<CheckoutElement preview={preview} />  // pix sample QR + fake code, card look-alikes, inert coupon
<StoreElement preview={preview} />     // storeVisible: false leaves it off
<PortalElement preview={preview} />    // member view: EXAMPLE_BUYER with one purchase
<CourseElement preview={preview} />    // the draft course with sample progress
```

The example buyer (`EXAMPLE_BUYER`, `exampleMemberView`, `exampleCourse`) is
exported for the dashboard's own member-view screens. The pix code and QR
encode nothing a bank app can pay.
