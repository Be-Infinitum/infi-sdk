---
name: sell-digital-product
description: Sell a file or a link — ebook, guide, pack, course access — and deliver it to the buyer after payment. Use when the user wants a one-time purchase with something to hand over, and for the thank-you page that serves it.
---

# Sell a digital product with Infi

End state: buyer pays with Pix, lands on your thank-you page, downloads what they
bought. Delivery is automatic — you attach the file once, Infi hands it over on
payment.

## 1. Catalog

Fastest path — one command, and it leaves a **published** product (publishing is
the step that turns a `422` into a sale):

```bash
npx -y @beinfi/cli bootstrap --intent one-time --ref cli --json
```

It writes `infi.company.ts` + `.env.local` with `INFI_SECRET_KEY`, syncs, and runs
doctor. To declare it yourself instead:

```ts
// infi.company.ts
import { defineCompany } from "@beinfi/sdk";

export default defineCompany({
  products: [{
    key: "guia",
    name: "Guia do Café",
    type: "item",
    pricingModel: "one_time",
    currency: "BRL",
    basePrice: "39.90",
  }],
});
```

```bash
npx -y @beinfi/cli sync infi.company.ts
```

**Do not use the `productId` that provisioning returns.** That seed product has no
key, no meter, and a draft version — it cannot be sold. Create your own.

## 2. Attach what the buyer gets

One deliverable per product; saving again replaces it. Only `type: "item"` +
`pricingModel: "one_time"` accepts one (anything else → `422
deliverable_not_allowed`).

```ts
// A link — Notion, Drive, your own members area:
await infi.products.deliverable.save(productId, {
  kind: "link",
  url: "https://seusite.com/area/guia",
});
```

A file goes straight to storage, so the bytes never pass through the API:

```ts
import { readFile } from "node:fs/promises";
const bytes = await readFile("./guia.pdf");

const { uploadUrl, objectKey } = await infi.products.deliverable.presign(productId, {
  fileName: "guia.pdf", contentType: "application/pdf", sizeBytes: bytes.byteLength,
});
await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: bytes });
await infi.products.deliverable.save(productId, { kind: "file", objectKey });
```

Order matters: `save` verifies the object exists. `uploadUrl` is valid 15 minutes.
If `presign` answers `503 storage_unconfigured`, that environment has no object
storage — use `kind: "link"`.

## 3. Charge

```ts
const { invoiceId } = await infi.checkout({
  slug,                       // your tenant slug, from provisioning
  productId,
  customer: { externalId: yourUserId, email, taxId },   // taxId is REQUIRED for Pix
  idempotencyKey: `venda:${orderId}`,                   // stable per purchase intent
});
const pay = await infi.pay.charge({ slug, invoiceId, method: "pix",
  idempotencyKey: `venda:${orderId}:pix` });
```

Store `invoiceId → your user` **now**, before rendering. It is how you know whose
purchase this was when payment confirms.

Render `pay.pixPayload` as a QR (or use `pay.pixQrImage`, a ready base64 PNG).

Traps, all of them real:

- **No `taxId`** → `422 customer_tax_id_required`. Pix cannot create a payer
  without CPF/CNPJ.
- **The `idempotencyKey` must come from the purchase intent**, not from the call.
  An auto-generated one covers a network retry, not a double-clicked button —
  a second click is a second call, and without a stable key it is a second invoice.
- **Never send the buyer to `invoiceUrl`.** That is the provider's own page, with
  the provider's brand. Render the QR on your screen.

## 4. Thank-you page: two polls, not two reads

```ts
// ALWAYS pass timeoutMs. It defaults to 600000 — ten minutes — so on an unpaid
// invoice, which is the normal case and the exact branch below serves, the handler
// hangs instead of rendering. Measured: still blocked at 25s without it.
const paid = await infi.pay.waitForPaid({ slug, invoiceId, intervalMs: 700, timeoutMs: 15000 });
if (!paid) return render("aguardando", { invoiceId });   // let them reload

// Fulfillment runs AFTER confirmation, so the grant is not there the instant the
// invoice flips. One read returns [] and you show a thank-you page with no
// download. Empty is 200, never 404 — safe to poll.
let grants = [];
for (let i = 0; i < 10 && grants.length === 0; i++) {
  grants = await infi.invoices.deliverable(invoiceId);
  if (grants.length === 0) await new Promise((r) => setTimeout(r, 500));
}
return render("obrigado", { download: grants[0]?.downloadUrl });
```

`invoices.deliverable` needs the **secret** key and `billing:read`. The token in
`downloadUrl` is a bearer capability with no expiry and no use limit — treat it
like a password: do not log it, do not put it in a shared URL.

Infi also emails the buyer that link. Do not rely on it: `emailSentAt` stays null
when the send fails, and an address that does not really exist (`@example.com`) is
the case that catches people testing. Serve the download yourself.

**The customer needs a real email to be charged at all.** `checkout()` accepts one
without it and mints a finalized, numbered invoice — then `pay.charge` answers
`500` with an empty `errors[]`, and that invoice can never be paid. `email: ""`
does the same. Collect the address before creating the invoice.

**Replacing a deliverable rewrites history.** A token minted for the old file
redirects to the new one, so yesterday's buyer gets today's product. Publish a new
product for a new edition rather than swapping the file under a sold one.

## 5. Verify it end to end

See the `test-payment-in-sandbox` skill: in sandbox you confirm the payment
yourself, with no provider credential, so this whole flow is testable in CI.
