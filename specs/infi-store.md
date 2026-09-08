# Spec — Infi Store: a merchant's page, a cart, and our checkout

**Status:** spec (planned). No code. Verified against the three repos on disk 2026-09-07.
Supersedes the **storefront half** of `specs/infi-catalog.md` (its P1); the agent requirements
loop there stays as that spec's own subject and becomes this one's P3 pointer. Related:
`specs/checkout-embed.md` (theming by knobs), `specs/checkout-custom-fields.md` (declared fields
and the contact step), `specs/cross-border-stablecoin.md` (a foreign buyer on the same page).

## The ask, stated literally

A merchant creates products where they already do, opens a **Store** module, and gets a page:
responsive, "almost a Linktree", every product they chose to show, a cart, and checkout through
ours. They can change the logo, the background and the text. *"Nada muito complexo."*

Two things in that sentence decide the spec. **"Quase um Linktree"** means one column, one URL,
one identity at the top and a list below; not a shop with sections. **"Nada muito complexo"** means
the merchant edits a handful of things and the page is otherwise ours. The embed spec already
named this posture for the checkout: *theming is a handful of documented knobs, not the
merchant's own CSS*. The store is the same posture, one level up.

## Context

A merchant with a published product has two ways to sell it: send a payment link, or embed the
checkout in a page they built. Both start from *the buyer already knows what they want*. There is
nowhere a buyer can see what a merchant sells, and a merchant who sells three things has three
links and no page. `specs/infi-catalog.md` answered that with a storefront that is a pure
projection, no editor at all. The product owner's ask keeps the projection and adds the minimum
a person needs to feel the page is theirs: their logo, their colour, their words, and the products
they picked, in the order they picked.

For the mission (`memory: infi-mission-everyone-entrepreneur`) this is the page a person sends
to their followers. It has to work for someone with no site, no company and no designer, on a
phone, in one sitting.

## The claim

A merchant opens Store, toggles four of their six products on, drags them into order, uploads a
logo, picks a background colour and writes two lines. They copy one URL. A buyer opens it on a
phone, adds two products to a cart, fills in email and name, and pays with Pix or card on the
checkout we already run. Both products are delivered, one email, one receipt. The merchant sees
one invoice with two lines and two enrollments.

## Design principles

- **Knobs, not a builder.** A closed list of things the merchant can change. Anything not on the
  list is ours, and adding to the list is a reviewed diff. The escape valve is the embed: a
  merchant who wants their own layout builds their own page with `@beinfi/checkout`. Refusing
  the builder is only honest while that valve exists, so say both in the same breath.
- **The page is a projection of published products plus a thin layer of presentation.** Product
  name, price, currency and description come from the product. The store adds selection, order,
  an image and the merchant's identity. If a product is unpublished it disappears, whatever the
  store says.
- **Amounts are never named by the buyer.** The cart carries product ids and quantities. The
  server prices. A `price` or `amount` anywhere in a store request is a 422.
- **The cart is an invoice with several lines.** No order object, no second checkout. The
  buyer pays the invoice on the checkout that exists, and everything downstream (payment,
  receipt, webhook, refund, fulfilment) already keys off an invoice.
- **Delivered per line, not per invoice.** A cart of two digital products grants two
  deliverables. This is the one structural change the cart forces, and it is named below.
- **One URL, on our domain, in v1.** The merchant's slug is already unique on live (ADR 0055).
- **Declared in code, or clicked in the dashboard, same column.** `infi sync` and the Store module
  write the same rows. A merchant with a repo keeps the store in git; one without never learns
  there is a file.

## Verified facts (design constraints)

| Fact | Where |
|---|---|
| `products` has `name, type, description, pricing_model, currency, status, key` and **no image, no visibility, no position** | `genesis.up.sql` `products` |
| `tenants` has `slug, name, support_email, terms_url` and **no logo, no colours, no bio**; `PATCH /account/tenant` edits `name`, `status`, `termsUrl` only | `genesis.up.sql` `tenants`; `openapi.yaml:3409-3459` |
| The checkout already has a **logo slot that nothing fills**: `CheckoutMerchant.logoUrl` is optional in the frontend type and no backend field produces it | `frontend/src/lib/checkout/types.ts:8`; `checkout-order-summary.tsx:115`; grep over `internal`, `api` |
| The slug is **reserved per org on live** and appears in every public URL as `/pay/{slug}/…` | ADR 0055; `internal/checkout/handler.go:274` |
| A payment link is **one product**: `payment_links.product_id NOT NULL`; a session is **one link**: `checkout_sessions.link_id NOT NULL`, deduped on `(link_id, lower(email))` | `genesis.up.sql` `payment_links`, `checkout_sessions`; ADR 0016 |
| `materializeFromLink` branches: a product with a billing cycle enrolls and bills a period; anything else opens a one-off invoice; `usage` is refused with a 400 | `internal/checkout/handler.go:1075-1140` |
| **An invoice binds to one enrollment**: `createEnrollmentInvoice(enrollmentID)` writes it into `invoices.customer_id`; `invoices.payer_id` exists beside it | `internal/invoice/store.go:361-373`; `genesis.up.sql` `invoices` |
| `invoice_line_items` already holds many lines per invoice (`description, quantity, unit_price, amount, price_id, meter_id`) and **no `product_id`** | `genesis.up.sql:406-418` |
| **Fulfilment resolves invoice → one enrollment → one deliverable**; `Resolve` returns one row | `internal/fulfillment/store.go:23-43`; `ResolveDeliverableForInvoice` |
| A grant is unique per `(payment, deliverable)`, so two deliverables on one payment are two grants | `internal/fulfillment/store.go:47-70`; `deliverable_grants` |
| The checkout order summary renders **one product line**: `lineItems.find(item => !isDiscount(item))` | `frontend/.../checkout-order-summary.tsx:66-67` |
| A coupon can already be applied on a public checkout invoice | `internal/checkout/handler.go:299`; `openapi.yaml:536` |
| Presigned upload to a private R2 bucket exists for product deliverables (`PresignPut`, `HeadObject`, `Delete`); nothing serves a **public** image | `internal/product/deliverable.go:91-173` |
| Public reads are rate-limited by `readLimiter`; writes by `writeLimiter` plus a per-resource bucket | `internal/checkout/handler.go:278-296` |
| `defineCompany` declares products with `key, name, type, pricingModel, currency` and nothing about a store | `packages/sdk/src/company-intents.ts` |
| The frontend direction is stock shadcn; the public checkout pages live under `src/app/pay/[slug]` with an empty layout | `memory: design-system-package-deprecated`; `src/app/pay/[slug]/layout.tsx` |
| `checkout_sessions` retains everything forever; nothing deletes a session | `specs/checkout-custom-fields.md` |

Read the middle rows together: **everything from "pay" onward is built for one product per
purchase.** The link, the session, the invoice's binding, the fulfilment resolver and the order
summary each assume it. The page and the knobs are cheap. The cart is where the work is, and it is
work on the invoice, not on the store.

## The store object

One row per tenant, `store_settings`, plus a selection table. Everything the merchant can change
is a column here, and there are deliberately few:

```jsonc
// store_settings, one per tenant
{
  "published": true,
  "title": "Ateliê da Ana",              // ≤ 60 chars; defaults to tenants.name
  "bio": "Aulas de aquarela e kits.",    // ≤ 280 chars, plain text
  "logoKey": "store/…/logo.png",         // private bucket, served through our CDN path
  "background": { "kind": "color", "value": "#F7F3EE" },   // or { "kind": "image", "key": "…" }
  "accent": "#7A4E2D",                   // one colour; text colour is derived for contrast
  "layout": "list",                      // list | grid
  "links": [                             // ≤ 5, the "Linktree" part
    { "label": "Instagram", "url": "https://instagram.com/…" },
    { "label": "WhatsApp",  "url": "https://wa.me/…" }
  ],
  "locale": "pt-BR"                      // pt-BR | en; the checkout already switches
}

// store_items: which products, in which order
{ "productId": "…", "position": 1 }
```

**The closed knob list:** title, bio, logo, background (one colour or one image), accent, layout,
up to five links, locale. Nothing else. Deliberately absent: fonts, custom CSS, sections, banners,
per-product colours, a second page, a custom domain (open question 1). Each is a reasonable
request and each is one step toward a shop builder.

**Product image** is a new nullable `products.image_key`, uploaded through the same presign path
deliverables use, into a bucket path that is publicly readable through our CDN. One image per
product, ≤ 2 MB, JPEG/PNG/WebP, resized server-side to two widths. A product without an image
shows its initials on the accent colour, as the checkout already does for a merchant without a
logo.

**Company-as-code** gains the same shape, so a merchant with a repo declares it once:

```ts
export default defineCompany({
  products: [{ key: "aquarela-101", name: "Aquarela 101", pricingModel: "one_time", store: { visible: true, position: 1 } }],
  store: { title: "Ateliê da Ana", bio: "…", accent: "#7A4E2D", links: [{ label: "Instagram", url: "…" }] },
});
```

`infi sync` upserts `store_settings` and `store_items` like every other declared field, and
running it twice is a no-op. Images are not declared in code (a binary in a config file is the
wrong shape); the dashboard uploads them.

## The public page

`app.beinfi.com/s/{slug}`, served by the frontend from `GET /store/{slug}`, a public read under
the same `readLimiter` as the checkout. The response is the settings, the ordered visible products
(name, description, price, currency, pricing model, image URL, and the product's payment link
token), and the merchant's `supportEmail` and `termsUrl`.

Layout is fixed: identity at the top (logo, title, bio), the links row, then the products as a
list or a grid. Tapping a product opens a sheet with the description and one button. On a
`one_time` product the button is **Adicionar**; on a product with a billing cycle it is
**Assinar** and goes straight to that product's existing payment link, because a subscription
does not go in a cart (see below). A `usage` product is never listed, whatever `store_items`
says, for the same reason the payment link refuses it.

The page passes the checkout's own bar: 320 px wide with no sideways scroll, forty products
without a page that never ends (paginate at 24), and the language bar the checkout already has.
It renders in the buyer's locale, falling back to the store's.

**Unpublished store, unknown slug and a tenant that is not live** all answer the same 404 page,
so the URL leaks nothing about who exists.

## The cart, and why it is an invoice

The cart lives in the buyer's browser (`localStorage`, keyed by slug) as `[{ productId, quantity }]`
until they tap **Finalizar**. Nothing is stored on our side for an abandoned cart, which is the
correct answer to the retention problem `checkout-custom-fields.md` names: there is nothing to
retain.

**Finalizar** opens the contact step the checkout already has (email, name, tax id under the rules
`cross-border-stablecoin.md` P0 sets, declared fields from `checkout-custom-fields.md` when they
land), then:

```
POST /store/{slug}/carts
     { items: [{ productId, quantity }], email, name, taxId?, country?, answers? }
     → 201 { invoiceId, redirectUrl: "/pay/{slug}/invoices/{invoiceId}" }
```

The server prices every line from the product's published version, refuses any body carrying
`price`, `amount` or `unitAmount` (422, with a test enumerating those names), caps `quantity` at
20 per line and 10 lines per cart, refuses a mix of currencies (422: *"all items must share one
currency"*), refuses any product that is not visible, published and `one_time`, and then does
what `materializeFromLink` does for one product, for N:

1. `UpsertCustomer` once, on the email.
2. `enrollForPurchase` **once per product**: N enrollments, one customer.
3. One invoice, bound to the **payer** (`invoices.payer_id`), with N line items, each carrying the
   new `invoice_line_items.product_id`.
4. Redirect to the existing invoice checkout, which already goes straight to payment for a known
   payer.

Then the buyer pays exactly as today. Coupons apply on the invoice as today. The webhook fires as
today. What changes downstream is one thing:

**Fulfilment resolves per line.** `Resolve(invoice)` becomes `ResolveLines(invoice)`: for each
line with a `product_id` whose product has a deliverable, one grant on the payment. The
deliverable email lists every grant in one message. A refund of the payment revokes every grant on
it, as today. The order summary and the receipt render every line, not `find()` the first.

**Why not one invoice per product, paid together?** Because there is no "paid together": a payment
is against one invoice, Pix included. **Why not an order object above the invoice?** Because every
downstream consumer already keys off the invoice, and an order would be a second place where the
total lives. The infi-catalog spec proposed an *offer* object because answers change the price;
the store has no answers that change the price, so it needs no offer. If declared fields ever
price a line, the offer comes back, and it belongs to that spec.

**Subscriptions do not go in the cart.** A subscription materialises as an enrollment, a
subscription and a period bill; a one-time as an invoice. One invoice paying both needs two
materialisations under one payment, which is the mixing `infi-catalog.md` already refuses. A
subscription product on the store is bought alone, through its own link, and the cart says so if
one is already in it.

**Prepaid without a cycle** (a credit pack) is a one-off invoice today and goes in the cart. With
a cycle it is a subscription and does not.

## Schema and core changes, in full

The product owner authorised whatever core and schema changes the store needs (2026-09-07). This
is the complete list; anything not here is not needed, and a PR that adds a table not listed has
left the spec.

### New tables

```sql
-- One store per tenant. Every knob is a column, so the list of knobs is the list of columns.
CREATE TABLE store_settings (
    tenant_id     uuid PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
    published     boolean NOT NULL DEFAULT false,
    title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
    bio           text CHECK (length(bio) <= 280),
    logo_key      text,                                   -- object key; served via the public image path
    background    jsonb NOT NULL DEFAULT '{"kind":"color","value":"#FFFFFF"}',
                  -- {"kind":"color","value":"#RRGGBB"} | {"kind":"image","key":"…"}
    accent        text NOT NULL DEFAULT '#111111' CHECK (accent ~ '^#[0-9A-Fa-f]{6}$'),
    layout        text NOT NULL DEFAULT 'list' CHECK (layout IN ('list','grid')),
    links         jsonb NOT NULL DEFAULT '[]',            -- ≤ 5 × {label ≤ 24, url https://…}; enforced in Go
    locale        text NOT NULL DEFAULT 'pt-BR' CHECK (locale IN ('pt-BR','en')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Which products, in which order. Selection lives here so `products` stays a billing object.
CREATE TABLE store_items (
    tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    position    integer NOT NULL CHECK (position >= 0),
    PRIMARY KEY (tenant_id, product_id),
    UNIQUE (tenant_id, position) DEFERRABLE INITIALLY DEFERRED   -- reorder in one statement
);

-- A cart at the moment of "Finalizar": the store's equivalent of checkout_sessions (ADR 0042).
-- Nothing exists before that moment; the browser holds the cart.
CREATE TABLE store_carts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email         text NOT NULL,
    name          text,
    tax_id        text,
    country       character(2),
    items         jsonb NOT NULL,                          -- [{productId, quantity}], as priced
    items_hash    bytea NOT NULL,                          -- sha256 of canonical items; the dedupe key
    field_answers jsonb,                                   -- specs/checkout-custom-fields.md, when it lands
    status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','expired')),
    invoice_id    uuid REFERENCES invoices (id),
    expires_at    timestamptz NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
-- One live cart per (tenant, buyer, same items): a double tap on Finalizar reuses the invoice.
CREATE UNIQUE INDEX store_carts_live_uidx ON store_carts (tenant_id, lower(email), items_hash)
    WHERE status = 'open';
```

### Columns on existing tables

```sql
ALTER TABLE products ADD COLUMN image_key text;             -- one image; uploaded via the deliverable presign path
ALTER TABLE invoice_line_items ADD COLUMN product_id uuid REFERENCES products (id);
ALTER TABLE invoices ADD COLUMN source text CHECK (source IN ('link','store','api','billing','rail'));
ALTER TABLE invoices ADD CONSTRAINT invoices_has_a_party CHECK (customer_id IS NOT NULL OR payer_id IS NOT NULL);
```

`invoices.customer_id` is nullable in genesis; a cart invoice leaves it NULL and sets `payer_id`.
Every reader that joins `product_customers` on `i.customer_id` (twelve query sites) is reviewed in
the P2 PR; those that need the product switch to the line, those that need the person switch to
`payer_id`. This is the core change `specs/digital-delivery.md` specifies and
`backend/docs/decisions/0061-an-invoice-may-bind-to-a-payer.md` records.

### Core code

- `invoice.CreateProductInvoice` writes `product_id` on its line and `source = 'link'`. A new
  `invoice.CreateCartInvoice(payerID, lines[])` prices each line from the product's published
  version, enrolls per product, opens one invoice on the payer with `source = 'store'`.
- `fulfillment.Resolve` → `ResolveLines`; N grants per payment; one email listing all
  (`specs/digital-delivery.md`).
- `checkout` gains `GET /store/{slug}` and `POST /store/{slug}/carts` under the existing limiters,
  and the invoice checkout learns to render N lines.
- `product` gains image upload (presign, head, delete, resize) and a public image path.
- `paymentlink.ProductDisplay` gains `description` and `imageUrl`, which the checkout can show too.
- `company-intents` (SDK) gains `store` and per-product `store: { visible, position }`; `infi sync`
  upserts `store_settings` and `store_items`.
- Frontend: `/s/[slug]` page, the Loja screen, N-line order summary and receipt, `logoUrl` fed from
  `store_settings.logo_key` on every checkout read.

### Not changed

`payment_links`, `checkout_sessions`, `product_deliverables`, `deliverable_grants`, the ledger,
routing, treasury. The cart does not touch money movement; it changes what one payment is for.

## The Store module in the dashboard

One screen under Products, called **Loja**. Left: the knobs form (title, bio, logo upload,
background, accent, layout, links, locale) and the product list with a toggle and a drag handle.
Right: the real page in an iframe, the way the embed spec previews the checkout, refreshing on
save. Above: the URL, a copy button, a QR code, and **Publicar** / **Despublicar**.

That is the whole module. No pages, no sections, no analytics beyond what Payments already shows.
The one number worth adding later is "purchases that started on the store", which the cart
endpoint can stamp on the invoice as `source = store` for free; it is in P2 because it is free,
and nothing else about analytics is.

## Phasing

**P1 — the page and the knobs, single-product buy.** `store_settings`, `store_items`,
`products.image_key`, the public read, the page at `/s/{slug}`, the Loja screen, `defineCompany`
support. A product's button goes to its **existing payment link**. No cart. *At the end:* the
art-workshop merchant sends one URL and sells everything they flagged, one product per purchase,
with their logo on the page and on the checkout (`logoUrl` finally has a source).

**P2 — the cart.** `POST /store/{slug}/carts`, `invoice_line_items.product_id`, invoice bound to
payer, per-line fulfilment, N-line order summary and receipt, cart UI, `source = store` on the
invoice. *At the end:* the claim holds: two products, one payment, two deliveries, one receipt.

**P3 — the agent arm.** `specs/infi-catalog.md`'s requirements loop over the same `GET
/store/{slug}` and `POST /carts`, answering `402 + accepts[]` to a buyer that is a program. Not
designed here; pointed at, so the P1 and P2 shapes do not close it off. Concretely: the cart body
and the store read must stay JSON an agent can consume, which they are.

P1 without a cart is a real product on its own and is the fastest thing in this file. P2 is the
invoice work and should not be rushed into P1 to make a demo look complete.

## Verification

- A merchant flips a product on in Loja, and it appears on `/s/{slug}`; `infi sync` with the same
  declaration is a no-op; unpublishing the product removes it whatever `store_items` says.
- A `usage` product toggled on never renders; a subscription product renders **Assinar** and lands
  on its payment link.
- The page at 320 px does not scroll sideways; 40 products paginate.
- Unknown slug, unpublished store and a sandbox-only tenant all return the same 404.
- The logo uploaded in Loja shows on the store **and** on the checkout header.
- `POST /carts` with `price`, `amount` or `unitAmount` anywhere in the body answers 422, and a
  test enumerates those names; with two currencies, 422; with 11 lines or quantity 21, 422; with an
  unlisted product, 422.
- A cart of two digital products, paid by Pix in sandbox: one invoice, two lines with
  `product_id`, two enrollments, two grants on one payment, one email with two links, a receipt
  showing both lines; a refund revokes both grants.
- A cart containing a subscription product is refused at **Finalizar** with the sentence that
  explains why, not at the server.
- Abandoning a cart stores nothing server-side; the first row appears at **Finalizar**.
- The contact step refuses a `BR` buyer with no CPF and accepts a `PT` buyer without one, per
  `cross-border-stablecoin.md` P0, on the store as on the link.

## Non-goals

**A shop builder.** Sections, themes, fonts, CSS, banners, a second page, per-product styling. The
escape valve is `@beinfi/checkout` on the merchant's own page, and this spec is only honest while
that valve is real.

**A custom domain**, in v1. Open question 1; it is DNS, TLS and a proxy, not a store feature, and it
is the one item on this list most likely to be asked for first.

**Inventory, variants, shipping, physical fulfilment.** Unchanged from `infi-catalog.md`. A store
invites "sold out" and the schema has no stock; adding it makes a billing system an ERP.

**Search, categories, filters, reviews, related products.** A Linktree has none of them and that
is the model.

**A cross-merchant Infi marketplace.** `store_items` scopes to the merchant's own page. A global
listing buys curation, review and takedown liability for other people's goods. Refused, together
with open discovery, as before.

**Mixing a subscription and a one-time in one cart.** Two materialisations under one payment.

**Partial refunds by line.** A refund is against the payment and revokes every grant on it. Per-line
refund is an accounting feature with its own spec.

**Analytics** beyond `source = store` on the invoice.

## Open questions

1. **Where does the store live?** `app.beinfi.com/s/{slug}` is safe and ugly. `beinfi.com/{slug}`
   collides with every top-level route the app has (`/pay`, `/embed`, `/login`, …) unless slugs
   are reserved against them, which ADR 0055 could be extended to do. `{slug}.beinfi.store` is the
   nicest and is a wildcard certificate and a routing rule away. A custom domain is the merchant's
   own DNS pointing at the same page, and it is the one most people will ask for.
2. **Does `visible` belong on the product or in `store_items`?** This spec puts selection and order
   in `store_items` so the product stays a billing object. `infi-catalog.md` put a `visible`
   boolean on the product. One of the two; the SDK shape above assumes `store_items`.
3. **Bind the cart invoice to the payer or to the first enrollment?** Payer, so that no line is
   privileged. But `invoices.customer_id` is read by more than fulfilment (dashboard, statements,
   webhooks), and every reader that assumes it is an enrollment needs a look before P2.
4. **Is the abandoned-cart problem really solved by `localStorage`?** The cart is, but the contact
   step's answers still land in a session at **Finalizar**, and the retention fix
   `checkout-custom-fields.md` names as P0 is still owed.
5. **Public images and moderation.** A merchant can upload anything as a logo or product image and
   it is served from our domain. Size and type limits are cheap; a takedown path and a report
   button are not, and a public page needs at least the first.
6. **One store per tenant, or per product line?** One. A merchant who wants two stores has two
   tenants, and that is the current model for everything else.
