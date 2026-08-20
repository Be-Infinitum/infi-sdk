---
name: test-payment-in-sandbox
description: Drive an Infi sandbox payment to paid without any provider credential — for local testing and CI. Use when a test needs a confirmed payment, or when someone asks how to mark a sandbox charge as paid.
---

# Confirm a sandbox payment

Sandbox is not a mock: charges go through a real provider account, so the Pix is
real and so are the webhooks. What changes is that **you** can confirm the
payment, with nobody's API key.

## The one thing to get right

The charge response carries `sandboxConfirmUrl` **only** in sandbox. Branch on
that field:

```ts
const pay = await infi.pay.charge({ slug, invoiceId, method: "pix" });

if (pay.sandboxConfirmUrl) {
  await fetch(pay.sandboxConfirmUrl, { method: "POST" });   // -> 200 {"status":"confirmed"}
}
await infi.pay.waitForPaid({ slug, invoiceId, intervalMs: 700 });
```

**Never branch on the shape of `pixPayload`.** In sandbox it is that same
confirmation URL; in production it is a Pix EMV string. Code that checks
`pixPayload.startsWith("https")` works in every test you run and silently does
nothing for real buyers. The field is the contract; the payload's shape is not.

In production this route is not merely refused — it is **not mounted**, and the
field is absent. The `if` above is what makes the same code correct in both.

## Rendering it is mode-agnostic

`pixPayload` is a QR in both modes. Scanned in sandbox, a phone opens the
confirmation page (amount + one button). Scanned in production, a bank app pays
it. Your rendering code does not change — which is the point.

`providerPixPayload` carries the provider's real EMV in sandbox, if you want to
see what production would have returned. It is a test-account EMV: not payable.

## In CI

```ts
const { invoiceId } = await infi.checkout({ slug, productId,
  customer: { externalId: "test-user", email: "buyer@yourdomain.com", taxId: "52998224725" } });
const pay = await infi.pay.charge({ slug, invoiceId, method: "pix" });
await fetch(pay.sandboxConfirmUrl!, { method: "POST" });
expect(await infi.pay.waitForPaid({ slug, invoiceId })).toBe(true);
```

- Confirming twice is safe: the second answers `200` and does nothing. It is a URL
  people reload.
- Use an email on a domain that exists if you care about the fulfillment email —
  `@example.com` is reserved and never delivers, which leaves `emailSentAt` null.
- Webhook registration answers `503 secret_store_unavailable` in sandbox, so poll
  (`waitForPaid`) instead of waiting for a delivery.

## What does not exist in sandbox

Not bugs, not your fault:

- `providers.*` → `404`. Connecting your own provider (BYOP) is production-only.
  In sandbox, Infi is the processor and `provider` comes back `"infi"`.
- `webhooks.create` → `503`, as above.
- Card may be off: the public link response carries `cardEnabled`. If false, only
  Pix and boleto work on that tenant.
