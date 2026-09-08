# Spec — tenant contacts: a pipe for the merchant's leads, not a CRM

**Status:** spec (planned). No code. Target: one new table (`contacts`), one Go package
(`internal/contact`), one dashboard list under `(dashboard)/contacts`, one webhook event, one CSV
in each direction. Verified against the three repos on disk 2026-09-06. Companion to
`checkout-custom-fields.md`, which refuses the CRM this spec also refuses, and to the integrations
module, which does not exist yet and which this spec is the first consumer of.

## The ask, stated literally

> "Ter um rolê de tenant leads que o cara pode jogar os leads e salvar na nossa plataforma, só pra
> ser algo que ele possa usar pra exportar, fazer email marketing via Resend, jogar no CRM quando a
> gente tiver o módulo de integrações."

Four verbs: **jogar** (ingest), **salvar** (store), **exportar** (egress), **jogar no CRM / email
marketing** (egress again). Three of the four are about moving data. One is about holding it. The
recommendation is to build the three and make the fourth as small as the three allow.

## The decision in one line

**Infi is a pipe for the merchant's contacts, not their database.** A contact enters through a
bounded set of doors, sits in one flat table the merchant can empty at will, and leaves through
CSV, a webhook, and later through integrations. Infi never sends marketing to a contact. Infi never
becomes the place where the merchant *manages* a contact.

The line between pipe and store is where `checkout-custom-fields.md` drew it: *"a searchable,
filterable buyer list, saved views, tags — refused, this is the CRM slope, and the first step down
it."* This spec adds a list. It does not add the step after.

## What already exists — verified

| Fact | Where |
|---|---|
| A table named `leads` **already exists and is Infi's own funnel**: one row per sandbox claimable, email unverified, status `new/contacted/converted/expired`, reminder sweep | `db/migrations/000011_leads.up.sql`, ADR 0056, `internal/claim/lead.go` |
| A second lead-shaped table, `company_open_requests` (name, email, phone, notes, status), also Infi's own funnel | `genesis.up.sql:232-242` |
| ADR 0056 says out loud: *"A third table of this shape means the abstraction was missed."* | `docs/decisions/0056-...md` |
| `customers` is `external_id, name, email, tax_id, psp_ref, country` — a billing subject, no phone, no consent, no source | `genesis.up.sql:288-298` |
| `checkout_sessions` keeps `email, name, tax_id` on every abandoned checkout **forever**; expiry flips status, no `DELETE` anywhere | `genesis.up.sql:198-213`, `db/queries/checkout_sessions.sql:72-81` |
| The expiry sweep already emits `checkout.session.expired`, and the code comment names the consumer: *"the hook a future cart-recovery worker consumes"* | `internal/checkout/expiry.go:18,47` |
| Infi already sends email through **Resend**, from **Infi's** default address, as a transactional notifier (login, invoice, receipt) | `internal/notification/provider/resend/resend.go:25`, `config.go:92-93` (`ResendFrom` — "default From address for login emails") |
| Webhook infra is real: signer, safe-dial, sender, 26 event types including `customer.created` | `internal/webhook/*`, event constants across `internal/` |
| **No CSV import or export anywhere** in the backend | grep `text/csv`, `csv.` — zero hits |
| No deletion path, no retention policy, no data map | `docs/backlog.md` §4.8 |
| The dashboard has a customers list and detail | `frontend/src/app/(dashboard)/customers/` |

Three things follow before any design:

1. **The name `leads` is taken**, and by the wrong owner. Infi's leads are people Infi wants to
   convert. The merchant's leads are people the *merchant* wants to convert. Same word, different
   controller, different table, different name. This spec uses **`contacts`**.
2. **ADR 0056's "third table" warning does not apply, and the reason is worth writing down.**
   `leads` and `company_open_requests` are both *Infi as controlador* — Infi decides why the row
   exists. `contacts` is *Infi as operador* — the merchant decides. Tenant-scoped, under RLS,
   deletable by the merchant without asking Infi. Sharing a table across the controller boundary
   would be the actual abstraction miss.
3. **The cheapest source of contacts is already collected and already leaking.** Every abandoned
   checkout is an email and a name Infi holds with no stated purpose and no expiry. Turning that
   into a contact the merchant *chose* to keep, and nulling the rest, is a net reduction in
   personal data held, not an increase.

## Doors in — bounded

| Door | Who writes | Shape | Phase |
|---|---|---|---|
| `POST /contacts` (authenticated, tenant key) | merchant's server or agent | one contact | P1 |
| `POST /contacts/import` — CSV, ≤ 5 000 rows, ≤ 1 MB, columns mapped by header | merchant, from the dashboard | many contacts | P1 |
| Abandoned checkout → contact, **opt-in per payment link** (`captureAbandoned: true`) | the buyer, via the existing contact step | one contact, `source = "checkout_abandoned"` | P1 |
| Completed checkout → contact, **opt-in per payment link** (`captureBuyers: true`) | the buyer | one contact, `source = "checkout"`; also linked to the `customers` row | P2 |
| Public capture form (`POST /pay/{slug}/contacts`, rate-limited like `/public/v1/claimables`) | anyone on the internet | one contact, `source = "form"`, `email` unverified | P2, and only with a per-link CAPTCHA/turnstile decision made first |

Not a door: **inbound webhook from third parties** (Typeform, Meta Lead Ads). That is the
integrations module's job, and it lands here through `POST /contacts` like any other server.

The abandoned-checkout door is the one that makes the feature pay for itself on day one and the one
that carries the sharpest LGPD edge (below). It is opt-in per link, default off, and the link
builder says what it does in one sentence: *"Guarda email e nome de quem começou a comprar e não
terminou, para você entrar em contato."*

## The one table

```sql
CREATE TABLE contacts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    email        text NOT NULL,                 -- lowercased on write; unverified
    name         text,
    phone        text,                          -- E.164 or NULL; never dialled by Infi
    source       text NOT NULL,                 -- 'api' | 'import' | 'checkout_abandoned' | 'checkout' | 'form'
    source_ref   uuid,                          -- link_id / checkout_session_id / import_id, by source
    customer_id  uuid REFERENCES customers (id) ON DELETE SET NULL,  -- set only when a contact becomes a buyer
    consent      text NOT NULL DEFAULT 'unknown'
                 CHECK (consent IN ('unknown', 'given', 'withdrawn')),
    consent_at   timestamptz,
    attributes   jsonb NOT NULL DEFAULT '{}',   -- ≤ 16 keys, string values, ≤ 2 KB. Merchant-owned. See "bounded, again".
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);
CREATE INDEX contacts_tenant_created_idx ON contacts (tenant_id, created_at DESC);
```

**Why `UNIQUE (tenant_id, email)`.** A contact list is a list of *addresses*, and the merchant's
question is always "do I have this person" not "how many times did they show up". A second sighting
updates `source`/`updated_at` and, if present, `name`/`phone` via `COALESCE`, the way
`UpsertCustomer` already does and the enrollment upsert notoriously does not
(`checkout-custom-fields.md`, "What already exists").

**Why `consent` is a column and not an attribute.** It is the one field Infi has to be able to
enumerate without reading a bag: the export marks it, the Resend push filters on it, the deletion
path reads it. `unknown` is the honest default for an import. Infi does not decide what `given`
means — the merchant sets it, and the import maps a column onto it.

**Why `customer_id` and not the reverse.** A contact may become a buyer; a buyer is never demoted to
a contact. The FK points from the lead to the member, exactly as `leads.converted_member_id` does
under ADR 0056, and nothing in the billing path ever reads `contacts`.

**Why no `status`, `stage`, `owner`, `tags`, `notes`, `last_activity`.** Each of those is a CRM
column. The moment two of them exist someone builds a kanban. `attributes` is where a merchant puts
`plano_interesse=pro` if they must, and it goes out in the CSV as columns.

### Bounded, again

`attributes` is the same argument as `checkout_fields`: free enough to feel like the merchant's,
bounded enough that Infi can enumerate what it holds. ≤ 16 keys, `^[a-z][a-z0-9_]{0,31}$`, string
values ≤ 256 chars, total ≤ 2 KB, 422 on violation. **No nested objects.** A CSV import maps
unrecognised headers into `attributes` up to the cap and refuses the file past it, with the column
names in the error.

## Doors out

| Door | What leaves | Phase |
|---|---|---|
| `GET /contacts` (paginated, `source`, `consent`, `created_after` filters — nothing else) | the list | P1 |
| `GET /contacts/export.csv` — same filters, one row per contact, `attributes` keys as columns | the merchant's data, in a shape another tool reads | P1 |
| Webhook `contact.created` (and `contact.updated` on a re-sighting) | id, email, name, source, consent, attributes — **the merchant asked for this contact, so the merchant's endpoint may have it** | P1 |
| Integration: **push to Resend Audiences in the merchant's Resend account** | contacts with `consent = 'given'` | integrations module |
| Integration: push to a CRM (HubSpot / RD Station / Pipedrive) | same | integrations module |

`export.csv` is the sentence *"you need no other database"* made honest: the merchant can leave with
everything, any day. It is P1, not P2, because a contacts feature without export **is** a lock-in
and the founder's own framing ("só pra ser algo que ele possa usar pra exportar") puts it first.

## Resend: Infi does not send marketing

This is the one place the spec pushes back on the ask as worded.

Infi already uses Resend, from Infi's own `From` address, for **transactional** mail: the buyer gets
a receipt because they bought something. That is art. 7º V (contract performance), and nobody
unsubscribes from a receipt.

Email **marketing** to a contact list is a different legal object and a different product:

- **Basis.** Consent (art. 7º I) or the merchant's legitimate interest (art. 7º IX), both the
  *merchant's* to hold and prove. If Infi sends, Infi executes a processing whose basis it cannot
  see, from a domain it owns.
- **Opt-out.** A marketing send must carry a working unsubscribe, and the unsubscribe must be
  honoured *by whoever sends next*. That means Infi owns a suppression list, forever, per tenant.
- **Deliverability.** Bounces, complaints and spam-trap hits on a shared Infi domain degrade the
  receipts for every other tenant. Sender reputation is not tenant-scoped.
- **The product.** Templates, segments, scheduling, open tracking, A/B. That is Mailchimp. Resend
  itself ships Audiences + Broadcasts for exactly this, on the *merchant's* domain, with the
  *merchant's* unsubscribe handling.

So the Resend integration is **"push contacts into the merchant's Resend Audience"** — an API key
the merchant pastes, a one-way sync of `consent = 'given'` contacts, and Resend does the sending.
Same shape as the CRM push. Infi's own Resend account never sees a marketing message. This is
strictly more useful to the merchant (their domain, their reputation, their unsubscribe page) and
strictly less liability for Infi.

The one Infi-sent email this spec allows is **cart recovery**, and only as a *transactional*
message about *this* purchase: one email, N hours after `checkout.session.expired`, "your Pix for X
is still available", link back to the session. No sequence, no discount injection, per-link opt-in.
It is the consumer the expiry code comment already promised. It is P2 and it is the only send.

## LGPD — the part that decides the phasing

`checkout-custom-fields.md` already carries the full argument; what changes here:

- **Purpose is stated by construction.** Every contact has a `source` and lives in a table whose
  only reason to exist is "the merchant wants to contact this person". That is the recorded
  instruction the operador needs, and it is more than `checkout_sessions` has today.
- **Abandoned checkout is where the edge is.** Today Infi keeps the abandoned buyer's email with no
  purpose and no end. This spec makes that a choice: links with `captureAbandoned` copy
  `email, name` into `contacts` with `source = 'checkout_abandoned'` and `consent = 'unknown'`; the
  sweep then **nulls `email, name, tax_id` on the expired session for every link**, opted-in or not.
  Net: fewer copies of personal data, each with a purpose.
  The merchant is told, in the link builder, that a buyer who typed an email into a checkout did
  not consent to marketing, and that `consent = 'unknown'` contacts are excluded from the Resend
  push by default.
- **Deletion is a real DELETE here.** Unlike `customers`, nothing FKs *into* `contacts` with
  RESTRICT. `DELETE /contacts/{id}` and `DELETE /contacts?email=` are true deletes, and a
  data-subject request from a buyer is a one-row walk. This is the *easy* half of backlog 4.8 and a
  reasonable place to build the pattern before the hard half.
- **Retention.** Per-tenant, default **24 months since `updated_at`**, sweep deletes past it, the
  number is shown in the dashboard next to the list. Not configurable in P1; a tenant that wants
  longer asks.
- **Art. 11.** `attributes` values are 256 chars; there is no `notes` column. The place to write
  "tem problema na coluna" does not exist.
- **Unverified email as identity — never.** ADR 0056's rule holds: a contact is found by id, a
  form-submitted email proves nothing, and no path from `contacts` grants access to anything.

## Phasing

**P0 — the deletion path, in this table first.** `DELETE /contacts/{id}`, the retention sweep, and
the checkout-session nulling. Shipping the doors in without the doors out-and-gone is the same
objection as in `checkout-custom-fields.md`, and here it is cheap because the table is new and
nothing restricts it.

**P1 — the pipe.** Table, `internal/contact`, `POST /contacts`, CSV import, `GET /contacts`,
`export.csv`, `contact.created`/`contact.updated` webhooks, abandoned-checkout capture behind a
per-link flag, one dashboard list with three filters and an Export button. SDK: `infi.contacts.create`,
`.list`, `.delete`. OpenAPI updated. No detail page — a contact is a row, and the row fits on the
list.

**P2.** Buyer capture (`captureBuyers`), the single cart-recovery email, the public form with a
turnstile decision. Checkout `field_answers` (from the companion spec) copied into `attributes` on
capture, so a "how did you hear about us" travels with the contact.

**Integrations module (separate spec).** Resend Audiences push, CRM push, inbound from Typeform /
Meta Lead Ads via `POST /contacts`. `contacts` is designed so that module needs no schema change:
`consent` to filter, `attributes` to map, `customer_id` to enrich, `contact.created` to trigger.

## What this deliberately refuses

- **A CRM.** No stages, owners, tags, notes, timeline, tasks, pipelines, saved views, dedupe UI.
  The list has three filters and an export button. If a merchant needs more, the export button is
  the answer and the CRM integration is the better answer.
- **Infi sending marketing email**, from any domain, on any provider. Cart recovery is the sole
  Infi-sent message and it is transactional.
- **Reusing `leads` or `company_open_requests`.** Different controller.
- **A contact detail page** in P1. Opening one contact is the first step to editing one, and editing
  one is the first step to a CRM.
- **Editing a contact from the dashboard.** API upsert and re-import only. The dashboard reads.
- **Phone as a channel.** Stored, exported, never dialled or messaged by Infi. WhatsApp is its own
  spec with its own consent regime.
- **Verification emails / double opt-in.** That is the marketing tool's job at the destination.
- **Unbounded `attributes`**, nested objects, files.
- **Merging contacts and customers into one "people" view.** A buyer is a billing subject with
  fiscal retention; a contact is a marketing record with a delete button. Different lifecycles,
  different tables, one nullable FK between them.

## Open questions for the founder

1. **Is 24 months the right default retention**, and does it need to be configurable in P1? My
   recommendation is fixed in P1, exposed in P2.
2. **Abandoned capture: default off per link, or default on with a tenant-wide switch?** Off is
   the defensible default. On converts better. I would ship off and measure how many merchants
   flip it.
3. **Should `export.csv` be free on every plan?** It should. It is the honest half of the promise.
   If the answer is "gate it", say so knowing it becomes lock-in.
4. **Does the SDK expose `contacts` at all in P1**, or is it dashboard + REST only? The agent-first
   story (`infi bootstrap --intent crm`) says yes; the `crm` intent in
   `backend-sandbox-instant-prompt.md` meters `leads_ingested` and would finally have something to
   meter.
5. **Which CRM first, when the integrations module comes?** RD Station is the Brazil-first answer;
   HubSpot is the one the agent templates already name. Not this spec's call, but it shapes the
   `attributes` conventions.

## Flagged as unverified

Whether the ingress caps request body size (the 1 MB import cap must be enforced in the handler
regardless). Whether Resend Audiences' API supports upsert-by-email or only create (affects the
integration's idempotency, not this table). Whether the checkout `expires_at` window is short enough
that nulling on expiry does not race a buyer who is still paying — the sweep only touches
`status = 'open'` rows past their window, so `processing` is safe, but the window itself I did not
read.
