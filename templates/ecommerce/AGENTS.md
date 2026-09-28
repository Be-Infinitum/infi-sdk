# AGENTS.md — Ecommerce template (Infi)

You are editing a store that sells digital products and a monthly subscription
through Infi. The owner edits this code with you. Keep the store working and
the money path intact. Change freely what things look like and what they say.
Do not change how payment and delivery work.

## What never changes

1. **Prices come from the server.** Show `price` from the storefront read
   (`src/lib/store.ts`). Never compute, discount or round a price on the front.
   Change a price in `infi.company.ts` and run `infi sync`. That publishes a new
   version, and existing subscribers keep the price they agreed to.
2. **The secret key stays on the server.** `INFI_SECRET_KEY` (`sk_…`) is read
   only in `src/lib/infi.ts`, which starts with `import "server-only"`.
   - Never import it from a `"use client"` file.
   - Never rename it to `NEXT_PUBLIC_*`.
   - Never hard-code it.
   - Never commit `.env.local` or `.env.live.local`.
3. **Delivery never rides on `onComplete`.** `onComplete` means the buyer
   finished the form, not that the money arrived. Infi mails the file when the
   payment confirms. Anything this site does on payment goes in
   `src/app/api/webhooks/infi/route.ts`, after `verifyWebhook`.
4. **Card fields stay in the provider's frame.** `<CheckoutElement>` and
   `<PortalElement>` (`@beinfi/elements-react`) run inside Infi's frames.
   Never build a form that collects a card number, and never read one.
5. **The buyer's portal token is never in `localStorage` or a URL.**
   `src/components/portal.tsx` keeps it in an httpOnly cookie through
   `/api/portal-token`. Leave it there.
6. **Product keys keep the `ecommerce/` prefix.** Keys are how `infi sync`
   recognises a product. Renaming a key creates a new product; it does not
   rename the old one.

## Elements

The Infi pieces come from `@beinfi/elements-react`: `<InfiProvider>` (in
`src/app/layout.tsx`), `<StoreElement>`, `<CheckoutElement>` and
`<PortalElement>` and `<LoginElement>`. Change their look with `appearance` on the provider, with
props, and with CSS (the `--infi-*` variables and the `infi-store*` classes).
Update them by bumping the package version. Do not fork their code.

**Language.** The elements speak Portuguese (pt-BR) and English (en). This covers the checkout,
the portal, the login, the code e-mail and the store's buttons. They pick one in this order:
1. the element's `locale` prop,
2. the `<InfiProvider locale>`,
3. the site's `<html lang>`,
4. the buyer's browser,
5. pt-BR.

For an English store, set `<html lang="en">`. The texts this template writes itself (header,
`/clube`) are the store's own copy, so translate those yourself.

## Login

Anyone can sign in to the store with a 6-digit code Infi mails (no password,
bought or not). There is one session for the whole site, the store login and
"Minhas compras", kept in an HttpOnly cookie by `src/app/api/infi/auth/route.ts`.

- **Sign-in page:** `/entrar` (`<LoginElement>`). `?next=/path` comes back there.
- **In a client component:** `useInfiAuth()` gives `status`, `buyer`, `has(key)` and
  `signOut()`. `<SignedIn>` and `<SignedOut>` show or hide children.
- **On the server (gating):** `const buyer = await auth.getBuyer()` from `@/lib/auth`.
  - `null` means nobody is signed in.
  - `buyer.has("ecommerce/clube")` is true while the product is bought and not refunded,
    or subscribed and still running.
  - See `src/app/clube/page.tsx`. Check on the server, never only in the browser.
- The token never goes to localStorage, a URL, or a `NEXT_PUBLIC_*` variable.

## How to change the catalog

- The catalog is defined in `infi.company.ts`. To change it, edit that file, then run
  `infi sync --plan` to see the changes and `infi sync` to apply them.
- **New product:** add an entry with a new key under `ecommerce/`. A digital file goes in `assets/`, as
  `deliverable: { kind: "file", path: "./assets/…" }`. Infi only delivers files for
  `one_time` + `item` products.
- **Coupon:** add it to `coupons`. The buyer types it in the checkout, before choosing how to pay.
  A code's terms never change; to change them, create a new code. Mark `sandboxOnly: true` for
  test coupons, so they never reach the live store.
- **Guarantee:** `guaranteeDays` (7–30). A refund the buyer asks for in "Minhas compras" inside
  that window is automatic; after it, the request goes to the owner's queue in the Infi dashboard.
- **Never edit** `infi.company.*.lock.json` by hand. `infi sync` writes those files and uses them
  to detect edits made in the dashboard.

## What exists (and what does not)

These exist:

| Feature | Details |
|---|---|
| Store | from the Infi storefront |
| Checkout | pix and card |
| Coupons | |
| Digital delivery | by e-mail |
| Subscription | monthly; cancel at the end of the paid period, and undo |
| Change card | the store's own Stripe; no charge |
| Refund request | within the guarantee |
| Minhas compras | orders, receipts, downloads |

These do not exist in this template:

- boleto
- physical products or shipping
- affiliates, split, points or credits
- cart recovery

If the owner asks for one of these, say that Infi does not offer it here yet, and do not
improvise one.

## Commands

```bash
npm run dev             # the store against your sandbox
infi login              # (re)writes .env.local with this project's sk_test_
infi sync --plan        # what would change
infi sync               # apply infi.company.ts
infi deploy --url https://your-site   # register the webhook, write INFI_WEBHOOK_SECRET
infi go-live            # where the go-live request stands
infi keys create --live # after go-live: this project's sk_live_ (asks for a step-up)
```

When the key is missing, revoked or from the other mode, the app says so. Run `infi login`
again.

## Going live

The live account starts empty:

1. `infi keys create --live`
2. `INFI_SECRET_KEY=<live key> infi sync`. This takes the catalog, the store and the files;
   `sandboxOnly` coupons stay behind. Each mode has its own lock file.
3. Put the live key and the webhook secret in the host's environment, then deploy.
