---
name: send-payment-link
description: Charge someone without building a checkout — create a payment link and send it. Use when the user wants to sell by email/WhatsApp, or wants the shortest possible path to taking money.
---

# Charge with a payment link

No checkout to build, no payment screen to design. One call, one URL.

## 1. A published product

```bash
npx -y @beinfi/cli bootstrap --intent one-time --ref cli --json
```

A product with an unpublished version cannot be sold — `invoices.createForProduct`
answers `422 product has no published version`. `bootstrap` publishes for you; by
hand it is `products.versions.publish(productId, versionId)`.

## 2. The link

```ts
const link = await infi.links.create(productId, { slug });
link.url;    // https://app.beinfi.com/pay/{slug}/links/plink_… — send this
```

Reusable: many buyers, one URL. `infi.links.list(productId)` and
`infi.links.revoke(productId, linkId)` manage them.

The hosted page is Infi's, with your product on it. The buyer never sees a
provider's brand — and never send them to `invoiceUrl` from a charge response,
which *is* the provider's page.

## 3. If you want your own screen instead

The buyer's side of a link is three calls. The invoice does not exist until the
third:

```bash
# what to render (public, no auth)
curl "$API/pay/$SLUG/links/$TOKEN"
# -> { "merchant": {…}, "product": "Guia", "testMode": true, "cardEnabled": false }

# open the session — email AND taxId are required
curl -X POST "$API/pay/$SLUG/links/$TOKEN/sessions" -H 'Content-Type: application/json' \
  -d '{"email":"buyer@domain.com","name":"Ana","taxId":"52998224725"}'
# -> 201 { "sessionId": "…" }

# charge — THIS materializes the invoice
curl -X POST "$API/pay/$SLUG/links/$TOKEN/sessions/$SESSION_ID/charge" \
  -H 'Content-Type: application/json' -d '{"method":"pix"}'
# -> 201 { "invoiceId": "…", "pixPayload": "…", "sandboxConfirmUrl": "…" }
```

- The charge is on the **session**, not the invoice. `/invoices/{id}/charge` exists
  and is for the `checkout()` flow, where you already have an invoice.
- Missing `email` → `400 "E-mail is required."`; missing `taxId` →
  `400 "A valid CPF or CNPJ is required."`
- These public `/pay/*` routes do **not** require `Idempotency-Key`. The
  authenticated API does.
- `cardEnabled: false` means only Pix and boleto on that tenant.

## 4. Knowing they paid, and delivering

`sell-digital-product` covers the thank-you page and the two polling loops;
`test-payment-in-sandbox` covers confirming a test payment with no provider key.
