# Skill — add one-time checkout

**When:** User sells a digital product or one-time purchase without login.

## Steps

1. `infi.billing.ts`:

```ts
export default defineBilling({
  products: [{
    key: "ebook",
    type: "item",
    pricingModel: "one_time",
    currency: "BRL",
    basePrice: "29.90",
    deliverable: { kind: "link", url: process.env.DOWNLOAD_URL! },
  }],
});
```

2. `infi sync infi.billing.ts`
3. Checkout:

```ts
const { invoice, url } = await infi.checkout({
  slug: process.env.INFI_SLUG!,
  productId,
  customer: { externalId: email, email },
});
```

4. Fulfill on `payment.confirmed` (webhook or poll `infi.invoices.get`).

## No apps provisioning

One-time checkout without login does **not** need `apps[]` in billing config.

See `examples/ebook-sale/`.
