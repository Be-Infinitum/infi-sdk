# Spec — merchant-declared checkout fields (and the CRM we are not building)

**Status:** spec (planned). Target: `checkout_sessions` + `payment_links` (one column each),
`internal/checkout/session.go`, the public link read, the contact step of
`frontend/src/components/checkout/checkout-payment-form.tsx`, and two dashboard reads. Verified
against the three repos on disk 2026-09-04.

## The ask, stated literally

A merchant sells access to an art workshop and wants to collect, at purchase time: address, a
note, phone, CPF, name, email, and **who referred them** — stored and shown in Infi, *"aí ela não
precisaria ter outra base de dados"*. The question put to us: should **the invoice**, **the
customer**, or **the customer-product enrollment** carry "additional data"?

The answer is none of those three, and the question contains two features wearing one coat.

## Two features, and conflating them is the whole risk

| | **(1) metadata** | **(2) checkout fields** |
|---|---|---|
| Who writes it | the merchant's server | the buyer's fingers |
| What it is | a pointer into the merchant's own system (`orderId`) | personal data with a stated purpose |
| Infi's job | store it, hand it back, never look at it | store it, validate it, **display it** |
| Shape | opaque bag | declared list: label, type, required |
| Trust | trusted (server-set) | untrusted (buyer-typed) — and that is fine |
| Already argued | `stripe-compat.md` §3, `checkout-embed.md` B8 | nowhere yet |

Stripe ships both, separately, and does not let either impersonate the other. So do we.

**Ship both. Never in the same bag.** The mistake is not wanting an arbitrary key-value bag — it
is putting a buyer's CPF and home address into the bag Infi promised never to interpret. The
moment the opaque bag holds personal data, every LGPD obligation below lands on a column nobody
can read. The founder's ask is (2): the smaller, more useful, more dangerous half.

## What already exists — verified

| Fact | Where |
|---|---|
| The enrollment **already has** `metadata jsonb DEFAULT '{}' NOT NULL` | `genesis.up.sql:778` |
| …and the enrollment is unique on `(product_id, customer_id)` — **buying twice is one row** | `genesis.up.sql:1643` |
| …and the upsert is `ON CONFLICT DO UPDATE SET metadata = EXCLUDED.metadata` — a **blind overwrite**, unlike `UpsertCustomer` which `COALESCE`s every column | `db/queries/product_customers.sql:4-5`, `db/queries/customers.sql:1-10` |
| …and **every payment-link purchase writes `{}` into it**: `enrollForPurchase` passes `Metadata: []byte("{}")` | `internal/invoice/store.go:308-313` |
| `invoices` has no metadata; nor do `CreateInvoiceRequest`, `Product`, `Price` | `genesis.up.sql:421-450` |
| `customers` is `external_id, name, email, tax_id, psp_ref, country` — **no phone, no address** | `genesis.up.sql:288-298` |
| `checkout_sessions` stores `email, name, tax_id`, nothing else; carries an indexed `invoice_id`; dedupes on `(link_id, lower(email))` while `open|processing`; and `RefreshOpenCheckoutSession` already takes a *newer* name/tax_id | `genesis.up.sql:197-213,1914`, `db/queries/checkout_sessions.sql:12,29-32` |
| **No `DELETE FROM checkout_sessions` anywhere.** Expiry flips a status; the row lives forever | `db/queries/checkout_sessions.sql`, ADR 0042 |
| `POST /products/{id}/payment-links` has **`requestBody?: never`** — a link is one button, zero fields | `openapi.yaml:1498`, `frontend/.../schema.ts:5847` |
| Enrollment metadata is in **zero** webhook payloads, on **zero** dashboard screens, and settable only by re-POSTing the enroll body — there is no PATCH | `internal/payment/event_payload.go:18-39`, `internal/checkout/session.go:61-70`, `internal/customer/handler.go:56-77` |
| The only validation on any metadata is `json.Valid` — no size, key-count, depth or type limit, and no `MaxBytesReader` anywhere | `internal/customer/service.go:34,58-67` |
| `POST /customers` accepts `metadata` and **silently drops it** (`customers` has no such column) | `internal/customer/handler.go:89,103-110` |
| No CSV/export exists in either repo. No customer deletion, no retention job, no data map, no DPA | backend grep; `docs/backlog.md:124-137` |
| A coupon can already be applied on a public checkout invoice, and `coupon_redemptions` records `customer_id` | `openapi.yaml:536`, `genesis.up.sql:246-255` |
| The one place this repo demonstrates "keep your own customer data" is a **starter template the merchant runs**, with its own Prisma database. Not an Infi product, not something to point anyone at as an answer — just evidence that the pattern so far has been *bring your own database* | `packages/cli/templates/crm/` |

Read the four enrollment rows together: **the column the founder was pointed at is destroyed on
his wife's second sale.** Metadata set through the API today is silently wiped by the buyer's next
payment-link purchase. That is not a reason to fix the column and then use it — it is the shape of
the object telling us it is the wrong object.

## Recommendation

**A payment link declares a bounded list of fields. The embed renders them. The answers land on
the checkout session, per purchase, and show on the payment and invoice screens.**

### Which object holds what

| Data | Object | Why |
|---|---|---|
| Buyer's answers to declared fields | **`checkout_sessions.field_answers`** | Per-purchase, buyer-typed, already the only pre-payment artifact (ADR 0042), already holds email/name/tax_id — the precedent is exact. Joins to money via `invoice_id`, which is indexed. |
| Field declarations | **`payment_links.checkout_fields`** | The link is what the merchant hands out per channel (ADR 0020). Declaring on the *product* drags version semantics in for nothing. |
| Merchant's own pointer (`orderId`) | **`invoices.metadata`** + `checkout_sessions.metadata` | `stripe-compat.md` §3 and `checkout-embed.md` B8. Set server-side. Opaque forever. |
| The customer's "real" address, phone, notes | **nowhere in Infi** | See below. |
| CPF, name, email | **already `customers`/`checkout_sessions`** | A custom CPF field is a second source of truth for a column that already exists and is already mandatory in link mode. Refused. |

**Not the enrollment**, for three independent reasons: it is per `(product, customer)` so a second
purchase of the same workshop overwrites the first buyer's answers; the upsert already destroys
the column on every link sale; and an enrollment is a billing relationship, not a purchase event.

**Not the customer**, because "the customer's address" is a lie the moment she buys twice or buys
two products. The buyer who moved between the March and June workshops has two addresses and one
customer row. A per-purchase answer is a fact with a timestamp; a profile is a claim that has to
be kept true, and Infi has no business keeping it true. This is ADR 0056 one layer down — *"a lead
is not a member, and the two must not share a table"*. A purchase answer is not a profile.

**The invoice** gets `metadata` (merchant, opaque) and nothing else: it is a fiscal document with
a retention obligation of its own, and putting a buyer's free-text note inside it welds that note
to the invoice's retention. Keep them separable.

### The bounded schema

```jsonc
// payment_links.checkout_fields — max 8 entries, total declaration ≤ 4 KB
[
  { "key": "endereco", "label": "Endereço completo", "type": "text",     "required": true,  "maxLength": 200 },
  { "key": "telefone", "label": "Telefone",          "type": "phone",    "required": true },
  { "key": "indicado", "label": "Quem indicou você?","type": "select",   "required": false, "options": ["Instagram","Amiga","Outro"] },
  { "key": "obs",      "label": "Observações",       "type": "longtext", "required": false, "maxLength": 500 }
]
```

Closed type enum: `text | longtext | phone | date | select | checkbox`. `key` matches
`^[a-z][a-z0-9_]{0,31}$`. Answers are **strings only** (a `checkbox` is `"true"`/`"false"`), total
answers ≤ 4 KB, and an unknown key, a missing required field or an over-length value is a **422 at
the session step**, not a silent truncation.

Deliberately absent types: `address` (composite implies validation, CEP lookup and eventually
shipping — Infi models none of it; an address is one `text` line we do not interpret), `file`,
`cpf`, `email`, `number`, `money`.

**Why bounded and not `additionalProperties: true`.** The unbounded version's bill at one year: no
answer to "which buyers picked *Instagram*" without a full jsonb scan; a CSV export with no
columns to name; an LGPD access request Infi cannot answer because it cannot tell which keys are
personal data; a support ticket about a key that vanished with no schema to prove it existed;
unbounded bytes on an endpoint with no body cap; and an SDK type that says `object` while the
backend accepts `[1,2,3]` because the only check is `json.Valid`. Every one of those is already
true of the metadata column we have.

The minimum structure that still *feels* free-form to the merchant is exactly the above: they
choose the labels, the order, the types and what is required. They do not choose the storage.

## The buyer's side — and no, it forces no embed decision

The embed is an iframe onto our own checkout, themed by knobs, not composed from the merchant's
components (`checkout-embed.md`). That is why this is easy: **the declarations travel
server-side.** `GET /pay/{slug}/links/{token}` already returns the product for the child page to
render; it returns `checkoutFields` too, and the contact step of `checkout-payment-form.tsx` — the
same step that already renders email/name/taxId — renders them below the CPF. The parent frame
passes nothing, learns nothing, and `InfiCheckoutEmbed` gains **no prop**. No embed-surface
decision is forced.

Two rules that follow, and they are not cosmetic:

- **Field answers must never be prefillable by URL param.** `buildEmbedUrl` already puts
  `email`/`name`/`taxId` in the query string (`packages/checkout/src/url.ts:181-183`), which is
  buyer-visible and buyer-editable. That is tolerable for a prefill the buyer can see and correct;
  it is not tolerable for merchant metadata, which is why link-mode `metadata` must be declared
  **on the link, server-side**, and never accepted from the browser.
- **Answers must never cross back over `postMessage`.** The protocol carries no CPF today by
  design; adding a buyer's address and phone to the parent's DOM would put personal data on the
  merchant's page for no reason the merchant asked for. `onComplete` keeps its current payload.

The one real UI cost: the contact step is inside a 997-line, 14-`useState` component that
`checkout-embed.md` already says needs characterization tests before anything touches it. Those
tests are a prerequisite here too, not a nice-to-have.

## "Who referred them" is three questions

1. **The referred buyer gets a discount.** Coupons already do this end to end: a public
   `POST /pay/{slug}/invoices/{id}/coupon` and a `coupon_redemptions` row carrying `customer_id`.
   One code per referrer, attribution already stored. Nothing to build.
2. **Attribution to a channel.** One payment link per channel — ADR 0020 already names
   *"campaign, partner, affiliate"* as the reason a product can have many links. Nothing to build.
3. **"How did you hear about us?"** A `select` custom field. This is what the workshop wants.

Whop's `affiliateCode` is (1) plus **paying the affiliate**, and paying a third party out of a
buyer's payment is a split — Connect-shaped, and `stripe-compat.md` already lists
`application_fee_amount` / `transfer_data` under what does not migrate. So referral stays deferred
as a *money* concept, and ships in P1 for free as a survey answer.

## What this deliberately refuses

- **A CRM.** Contacts, tags, notes-on-a-person, a timeline, segments, campaigns. The literal ask
  — *"she wouldn't need another database"* — is a CRM, and Infi does not have one. The only thing
  in this repo that looks like an answer is a starter template with its own Prisma
  DB. "Infi is your database" is a promise about durability, migration, export and deletion that a
  billing backend with no export and no deletion path cannot make.
- **Arbitrary merchant-defined personal data in an opaque bag** — not because JSON is bad, but
  because Infi must be able to enumerate the personal data it holds. See LGPD.
- **`metadata` on the enrollment as the answer to this ask.** Fixing the blind overwrite is worth
  doing (below); using the column for purchase answers is not.
- **Structured address, CEP lookup, shipping.** One free-text line or nothing.
- **File upload** — a different product, threat model and storage bill.
- **Conditional logic, multi-page forms, field-level pricing.** The last is a browser-settable
  amount, already a stated non-goal.
- **Editing an answer after payment.** It is evidence of what the buyer said at purchase time; a
  correction is a new fact, not an overwrite.
- **A second CPF, name or email field.** A duplicate drifts, and the duplicate is the one that
  ends up in the PSP call.

## LGPD — this is the reason the schema is bounded

Nothing here is hypothetical: `docs/backlog.md:128-130` already says it out loud — *"No retention
policy, no deletion path, no data map. Brazil-first makes this a legal requirement."*

- **Controller vs operador.** For `email`/`name`/`tax_id` Infi is the **operador** (art. 5º VII)
  on the merchant's instruction, with a defensible basis in contract performance and legal
  obligation (art. 7º V/II) — a CPF is on the fiscal document. For an address and a free-text note
  Infi has **no basis of its own**: it holds them purely because a merchant said to. Still
  operador — but only if the instruction is *recorded*. A declared field with a merchant-authored
  label **is** that record; an opaque jsonb blob is not, and a regulator asking "why do you hold
  this CPF" gets "we do not know".
- **Minimização (art. 6º III)**, already cited twice in this codebase
  (`internal/invoicedoc/handler.go:27`, `internal/billdoc/format.go:80`). An unbounded bag is its
  negation by construction.
- **Art. 18 rights** — access, correction, anonymization, deletion, portability, per *field*. A
  declared schema makes each a walk over 8 known keys. An opaque bag makes deletion
  unimplementable: Infi cannot delete "the CPF stored under `doc`" because it cannot find it, and
  cannot honestly claim it did.
- **Art. 11 sensitive data.** A free-text field on a *workshop* invites *"tenho problema na
  coluna, posso ficar sentada?"* — health data, stricter basis, in a column with none, and Infi
  cannot detect it. So `longtext` is the one type with a hard cap and a stated retention window,
  and the sentence "Infi is not a place to collect saúde, religião or biometria" goes next to the
  field builder, not in a PDF.
- **Art. 16 retention, and a live leak.** There is **no `DELETE` on `checkout_sessions`
  anywhere** — expiry flips a status. Today that strands three fields forever; with this feature
  it strands an abandoned buyer's address, phone and note. The expiry sweep must **null the
  answers**, and the window must be stated.
- **Art. 46 security.** `tax_id` is plaintext today (backlog 4.7); a custom field carrying a
  second CPF is a second plaintext copy nobody has audited. Another reason `type: cpf` does not
  exist.
- **Erasure is redaction, not deletion.** `invoices`, `subscriptions` and
  `platform_billing_accounts` all FK to `product_customers` `ON DELETE RESTRICT`
  (`genesis.up.sql:2386,2456,2546`). Whatever "delete my data" means here, it means nulling fields
  and keeping ids.

**Plainly: yes, LGPD is the reason to bound the schema.** Not the only reason, but the one that
turns "nice hygiene" into "we cannot answer a data-subject request otherwise".

## Who reads it back

| Surface | Needed for the workshop? | Verdict |
|---|---|---|
| Dashboard: answers on the invoice + payment detail screens | **Yes.** This is the whole ask — she looks at a sale and sees the address. | P1. Joined via `checkout_sessions.invoice_id`; no session screen exists today, so this rides the existing invoice/payment reads. |
| API read (`GET /invoices/{id}` carries `checkoutFields`) | Yes, and it is how the dashboard gets it. | P1 |
| CSV export of a product's purchases, declared fields as columns | **Yes** — a class list is a spreadsheet, and there is no export anywhere in either repo today. | P2. Also the honest answer to "she needs no other database": she can get her data out of ours. |
| Webhook payload carrying the answers | No — she has no server. | P2, and **only the merchant's own `metadata`**, not the buyer's answers. Pushing a buyer's address to every subscribed endpoint widens the personal-data blast radius for a merchant who never asked. Answers are readable by API; they are not broadcast. |
| A searchable/filterable buyer list, saved views, tags | No | Refused — this is the CRM slope, and the first step down it. |

## Phasing

**P0 — before any of this. Not negotiable, and it is not this feature.** Backlog 4.8: a deletion
path (redaction of `customers`/`product_customers`/`checkout_sessions` fields) and a purge of
expired checkout sessions. Adding merchant-defined personal data to a system with no way to remove
it is taking on a liability we cannot retract. If P0 is not wanted, ship none of the rest.

**P1 — the week version.** Solves the workshop case with no new table.

1. `payment_links.checkout_fields jsonb NOT NULL DEFAULT '[]'`, plus a request body on
   `POST /products/{id}/payment-links` (today `requestBody?: never`) and a PATCH to edit it.
   Validation of the declaration lives in `internal/paymentlink`.
2. `checkout_sessions.field_answers jsonb NOT NULL DEFAULT '{}'`. `createSessionRequest` gains
   `fields: Record<string,string>`, validated **against the link's declaration** — 422 on an
   unknown key, a missing required field, or an over-length value.
   `RefreshOpenCheckoutSession` takes the answers too; it already refreshes name/tax_id.
3. The expiry sweep nulls `field_answers`.
4. `checkoutFields` on the public link read; the contact step renders them — after the
   characterization tests `checkout-embed.md` already requires.
5. `checkoutFields` on the invoice and payment detail reads; two dashboard panels.
6. **Two verified bugs fixed on the way**, both silent-failure shaped, both in the neighbourhood:
   `metadata = EXCLUDED.metadata` on the enrollment upsert becomes
   `COALESCE(EXCLUDED.metadata, product_customers.metadata)` like `UpsertCustomer` does; and
   `POST /customers` stops accepting a `metadata` it drops on the floor.

**P2.** `metadata` on `invoices` + `checkout_sessions`, merchant-set server-side, round-tripped in
`payment.confirmed` / `invoice.paid` / `checkout.session.completed` — this is `checkout-embed.md`
B8 and `stripe-compat.md` §3, and it is a **different field** from the buyer's answers. Plus the
CSV export. Plus one shared, size-limited JSON guard replacing the two duplicated `jsonValidRule`
functions (`internal/customer/service.go:58`, `internal/metering/service.go:44`).

**P3.** `phone` promoted to a first-class `customers.phone` **if and only if** a notification
channel ever uses it — a phone number Infi never dials is a custom field, not a column. Per-field
retention windows. Field templates ("workshop", "evento").

## Is the catalog link the same feature?

No. `payment_links.product_id` is singular and `NOT NULL` (`genesis.up.sql:601`); a cart is priced
server-side and is already expressible as the invoice entry mode. Custom fields need none of that
and ship without touching it. They meet at exactly one point: both want a richer link. So keep the
declaration list **independent of product** in its shape, so that if a catalog link ever exists
the fields do not have to be unpicked from a product they were never tied to.

## Non-goals

A CRM; contacts/notes/tags/segments/campaigns; structured addresses, CEP lookup or shipping; file
upload; conditional or multi-step forms; field-level pricing; editing answers post-payment;
duplicate CPF/name/email fields; buyer answers in webhook payloads; arbitrary `metadata` on
`Price`; affiliate **payouts**.

## Open questions for the founder

1. **Is Infi controlador or operador for a field it cannot interpret?** A lawyer's answer, not
   mine. Until it exists, the ToS must say the merchant is the controller and Infi processes on
   instruction — and there is no DPA in either repo to say it in.
2. **Will we ship P0 first?** If the answer is "later", the honest recommendation is to ship
   nothing here. There is no CRM to point her at — `templates/crm` is a scaffold someone would
   have to build out, which is the same work she is trying to avoid.
3. **Does she need the address, or does she need it once** — for one certificate, one delivery?
   If once, a reply to the confirmation email is cheaper than a product.
4. **Does the data ever leave Infi?** CSV export is the difference between "she needs no other
   database" and "she is locked into ours". Pick one and say it out loud.
5. **Free-text notes at all?** It is the field most likely to attract art. 11 data, and the only
   one whose contents we cannot reason about. I would ship it with a 500-char cap and a stated
   retention, or not ship it.
6. Is "arbitrary metadata on the invoice" wanted *as well*? I think yes — for the merchant's
   server, P2, opaque. I am arguing against it only as the home for the buyer's answers.

## Flagged as unverified

Whether the ingress (Traefik/Cloudflare) caps request body size — nothing in the app does, so the
"unbounded bytes" claim is bounded only by infra I did not read. Whether a DPA or privacy policy
exists outside these three repos. Whether any notification channel could consume a phone number
(the P3 gate).
