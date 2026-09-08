# Spec — Infi Affiliates: attribution is the product, the money is already built

**Status:** spec (planned). No code. Verified against the three repos on disk 2026-09-07. Sits on
top of `specs/infi-split.md` (P2's `split_parties`, `party_payable`, the payout path) and reuses
its ledger and controls without changing them. Related: `specs/infi-loyalty.md` (the same buyer-
identity gap, solved the same way), `specs/cross-border-stablecoin.md` (a foreign affiliate),
`specs/tenant-contacts.md`, ADR 0007 (payout controls), ADR 0031 (Managed), ADR 0058 (claimable
tenants), ADR 0049 (no float).

**The distinction that opens the file.** A loyalty point is a unit only the merchant honours and is
never money (`infi-loyalty.md`). An **affiliate commission is money leaving the merchant to a third
party**: `payouts`, the seven ADR 0007 rules, a destination that is by definition *not* the
tenant's own tax id, and a person with a CPF and a tax problem. Same word "recompensa" in the
merchant's mouth, opposite machinery. Nothing in this spec ever writes to `loyalty_entries`.

## The decision in one line

**An affiliate is a Split party with a public front door and an attribution rule.** Infi Split
already models a person who is not the merchant, verifies their own destination, credits them from
`party_payable`, pays them through the treasury path and reverses them on a refund. Affiliates add
three things Split does not have and does not want: **self-service at scale**, **attribution**, and
**a hold before the money is payable**.

That is the whole scope. If this spec were building a second commission engine, it would be wrong.

## What Split already gives, unchanged

| Need | Where it already is |
|---|---|
| A person who is not a tenant, with CPF and a destination **they typed themselves** | `split_parties`, the acceptance page (Split P2) |
| The owner's debt to that person, at tenant level, with per-party detail | `party_payable` + `split_parties.balance` (ADR 0027's subsidiary ledger) |
| Commission computed at `payment.confirmed`, net of Infi's fee, persisted immutably | the allocator, `invoice_allocations` |
| Payout to the person's own key, through `Decide` → seven rules → `executeTransfer` | Split P2's second passing condition on `payout.destination_ownership` |
| Reversal on refund/chargeback, proportional, negative balances allowed | Split's reversal |
| A commission triggered by a coupon code | `trigger: { kind: "coupon" }` |
| "Abrir minha conta na Infi", with the balance moving to the new tenant | ADR 0058 + Split's `became_tenant_id` |

**Split's coupon trigger is already an affiliate program for five salespeople.** One coupon each,
one rule each, invited by hand. This spec exists because it does not survive five hundred, and
because a coupon is the weakest attribution there is: it only fires when the buyer remembers to
type it.

## Verified facts (design constraints)

| Fact | Where |
|---|---|
| `checkout_sessions` is `(tenant_id, link_id, product_id, email NOT NULL, name, tax_id, status, expires_at, invoice_id, payment_id)` — **no attribution column of any kind** | `000001_genesis.up.sql:198-213` |
| `payment_links` is `(tenant_id, product_id, token, active, revoked_at)` — a token, no parameters, no per-sender variant | `000001_genesis.up.sql:598-607` |
| **Nothing in the three repos mentions utm, ref codes, referrers or click tracking** | grep over `internal/checkout`, `internal/paymentlink` |
| `coupon_redemptions` is unique on `(coupon_id, invoice_id)`, so a coupon fires at most once per invoice | `000001_genesis.up.sql:246`, `:1400` |
| Coupons are **percentage-only** and carry `MaxRedemptions`, `RedeemBy`, `TimesRedeemed` | `internal/coupon/coupon.go` |
| `payout.destination_ownership` requires a CPF/CNPJ key to match **the tenant's own tax id**; EMAIL/PHONE/EVP fall to `nonTaxKeyMode`, default hold 24h | `internal/treasury/rules/rules.go:16-63`; ADR 0007 |
| The destination blocklist is a SHA-256 fingerprint over `(keyType, canonical key)` | `internal/treasury/destination.go:14-36` |
| A managed payout is parked `pending_approval` with `hold_reason = managed_manual` and completed by staff by hand | ADR 0031; migration `000016` |
| There is **no buyer or third-party login**: `internal/identity` holds `doc.go` and `staff/` | `internal/identity/` |
| A public endpoint has an in-memory per-client token bucket available (`WithKeyFunc`) | `internal/middleware/ratelimit.go:17-50` |
| `payment.refunded` / `payment.chargeback` carry the invoice and the amount; a partial refund leaves the sale standing | ADR 0032 |
| Split is **`managed`-only**, and the allocator runs only when the payment's provider is one of Infi's own accounts | `specs/infi-split.md`; `internal/collectionmode/fee.go` |

Read together: the money half is finished and the attribution half does not exist. There is not a
single column anywhere that can say *who sent this buyer*.

## Attribution — the actual work

### The link

A public redirect, on Infi's checkout domain so the cookie is first-party:

```
GET /r/{refCode}?to=<payment link token | store path>
  → sets cookie  infi_ref = {refCode, at}   Max-Age = program.attribution_window_days
  → 302 to the destination
  → records one affiliate_clicks row (refCode, day, coarse UA class, hashed IP)
```

The cookie is read when a checkout session is created, and the affiliate id is **stamped on
`checkout_sessions.affiliate_id`** — new column, and the first attribution fact the schema has
ever held. It is copied onto the invoice at finalisation, because a session expires and an invoice
must still explain a commission a year later.

**Last click wins, within the window, first party only.** Not because it is fairest — it is not —
but because every alternative (first click, linear, position-based) requires storing a per-buyer
click history, which is a tracking database and the thing `tenant-contacts.md` refuses to become.
The rule is written on the affiliate's own screen so nobody argues about it later.

### Three doors, in the order they should be built

| Door | How it attributes | Survives |
|---|---|---|
| **Link + cookie** | `infi_ref` cookie at session creation | same browser, same device, within the window |
| **Coupon** | `coupon_redemptions` on the invoice — Split's existing trigger | anything, including a different device and word of mouth |
| **Explicit code at checkout** | one optional field, "quem te indicou?" | a buyer who was told a name |

A coupon attribution **beats** a cookie when both are present, and the reason is that the buyer
performed it deliberately. All three resolve to one `invoice.affiliate_id`, and there is never
more than one: **one commission per invoice, always.** Sharing a sale between two affiliates is a
support ticket generator with no revenue on the other side.

Doors that are refused: server-to-server postbacks, fingerprinting, cross-domain identity,
pixels on the merchant's site, and any recovery of a lost cookie. An affiliate who wants
attribution that survives everything uses a coupon.

## Pending, available, paid — the difference from Split

Split pays a co-founder on a daily cadence and lets a refund push them negative, because a
co-founder keeps earning and the next allocation nets it. **An affiliate makes one sale and
disappears**, and a commission paid on day one against a sale refunded on day nine is money the
merchant will never see again. Chasing it is the collections process ADR 0049 says Infi does not
run.

So a commission has a state the Split allocation does not:

```
pending    ── program.hold_days elapsed, no reversal ──▶  available  ──▶  paid
   │
   └── refund / chargeback / affiliate suspended ──▶ reversed  (never paid, nothing to chase)
```

- **`hold_days` defaults to 30**, and its floor is the merchant's own refund window. The dashboard
  says so in one sentence, because an affiliate who does not understand the hold assumes theft.
- Only `available` is payable. `party_payable` is credited **at confirmation** as Split does — the
  merchant owes it from the moment the sale settles, and the ledger should say so — but the payout
  selector reads `available` only. The hold is a payability rule, not an accounting fiction.
- A reversal during the hold cancels the commission outright: no negative balance, no netting, no
  argument. This is the single most valuable line in the spec, and it is one `WHERE` clause.
- **A minimum payout** (default R$ 50) batches the rest, which is also what makes the fiscal
  section below survivable.

## Paying a pessoa física — the part that actually costs money

The mechanics are done; the question is what a commission to a CPF costs and who owes what.

**Direct: the merchant (PJ) pays a person (PF) for a service.** The instrument is an RPA and the
arithmetic is unkind:

| Encargo | Who pays | ~% |
|---|---|---|
| INSS patronal | **the merchant, on top** | 20% |
| INSS retained (contribuinte individual) | the affiliate, to the teto | 11% |
| IRRF | the affiliate, tabela progressiva | 0–27,5% |
| ISS on intermediação/agenciamento | município, sometimes retained | 2–5% |

A R$ 100 commission costs about R$ 120 and lands as about R$ 80. **The 20% patronal is why every
affiliate program in Brazil pushes its affiliates to open a MEI**: PJ to PJ, a nota, no retention,
no patronal, and the merchant pays the invoice.

**What the market actually does is architectural, not fiscal.** Hotmart, Eduzz, Kiwify and
Monetizze do not have the producer pay the affiliate. The platform receives the buyer's money and
**divides at settlement**: producer, affiliate and platform each get their share of the same
payment; the affiliate holds a balance *on the platform* and withdraws it to their own key. If the
affiliate was never paid *by the producer*, there is no PJ contracting a PF for a service, and the
RPA package is not on the merchant's desk. The affiliate declares the income; a minimum withdrawal
keeps the amounts above the noise floor.

**That is exactly the shape Infi already has in `managed`.** The money is in Infi's account, the
allocation is in Infi's ledger, and the payout leaves Infi's account to the affiliate's own key —
which is why Affiliates is `managed`-only for the same reason Split is, and not for a new one.

**And it is exactly counsel's question 3 in `infi-split.md`, with a larger N and a recurring
shape.** Split asks whether paying a merchant's declared partners from Infi's account changes
Infi's classification. Affiliates asks it about hundreds of people the merchant never met, paid
every month, which is the version a regulator would look at first. The design does not change
based on the answer; the go-live does.

**What this spec commits to until counsel answers:**

1. **The affiliate is remunerated by the merchant, and Infi is the payment agent**, exactly as
   Split states for a party. The agreement the affiliate accepts says so in its first paragraph.
2. **The fiscal responsibility is the affiliate's, declared on acceptance**, and Infi produces an
   **informe de rendimentos** per affiliate per year — the one fiscal artifact this spec owes and
   the cheapest possible one. Nota fiscal per recipient stays refused (Split's non-goal); Infi Tax
   is reserved (docs ADR 0008).
3. **A PJ path from day one.** `split_parties.tax_id` already takes a CNPJ; an affiliate who
   registers as PJ is paid to a CNPJ key, `destination_ownership` passes on the same party
   condition, and no retention question arises. The dashboard nudges toward it above a configurable
   annual total, with one sentence and a link, and never gives tax advice.
4. **Retention is not implemented and not simulated.** Infi does not withhold, does not compute
   INSS or IRRF, and does not present a net figure it cannot defend. A merchant who must withhold
   pays that affiliate outside Infi, and the program marks the affiliate `manual_payout` so no
   automatic payout ever contradicts the merchant's accountant.

Point 4 is the one to argue with. It is honest and it is a real product gap: the competitor
answer is to withhold and hand the merchant a report. That is a tax engine, it is docs ADR 0008,
and it is not this spec.

**A foreign affiliate** is the cross-border spec's `RemittanceSender` with `purpose =
revenue_share`, already added there for Split, and none of the Brazilian arithmetic above applies.

## Fraud, briefly, because it is the other treta

Affiliate programs are attacked from inside. Cheap controls, all of them one predicate:

- **Self-referral refused**: the invoice's payer email or tax id matching the affiliate's is
  `reversed` with a stated reason, never `pending`. This is the most common abuse by an order of
  magnitude.
- **One commission per invoice**, enforced by a unique index, so no stacking.
- **A coupon owned by an affiliate does not stack with a percentage the merchant already gave**;
  the program sets whether a discounted sale commissions at all, and on which base.
- **Chargeback farming is bounded by the hold**: `hold_days` is the whole defence and it is why
  the default is 30 rather than 7.
- **Click records are aggregate, not a per-buyer trail**: day, code, coarse UA class, hashed IP.
  Enough to show an affiliate their traffic and to spot a bot; not a tracking database.
- **The merchant can suspend an affiliate**, which stops attribution immediately and reverses
  everything still `pending`. Deliberate, and stated in the agreement.

## The affiliate's own surface

An affiliate checks their numbers far more often than a co-founder does, so Split's per-action
email link is the wrong door. Two steps:

- **P1: a magic-link portal**, session-scoped, at `/afiliado`. It is the same primitive
  `infi-loyalty.md` P1 adds for a returning buyer — a 6-digit code to the email on file, and it is
  built once for both. It shows: my link, my code, clicks, conversions, pending, available, paid,
  and the next payout date.
- **P2: "abrir minha conta na Infi"**, the claimable tenant (ADR 0058) Split already offers a
  party, with the balance moving to the new tenant's clearing account. An affiliate earning
  monthly is a person with an income source; giving them the account is the mission's own sentence
  and it costs nothing new.

**The merchant's side is one screen**, like Loyalty's: activate, one default commission
percentage, the hold, the minimum payout, approval mode (`auto` or `manual`), and the affiliate
list with their numbers. Per-product and per-affiliate overrides are `split_rules` rows and appear
only when asked for.

## Schema

Reusing Split's tables wherever the shape is the same.

```sql
CREATE TABLE affiliate_programs (            -- one per tenant
    tenant_id                uuid PRIMARY KEY REFERENCES tenants (id),
    default_percent          numeric(5,2) NOT NULL,          -- of the net-of-fee base
    attribution_window_days  integer NOT NULL DEFAULT 30,
    hold_days                integer NOT NULL DEFAULT 30,
    min_payout_amount        numeric(20,2) NOT NULL DEFAULT 50.00,
    approval_mode            text NOT NULL DEFAULT 'manual'  -- manual | auto
        CHECK (approval_mode IN ('manual','auto')),
    commission_on_discounted boolean NOT NULL DEFAULT true,
    status                   text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','active','paused')),
    terms_version            text NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now()
);

-- An affiliate IS a split party. This table is the public-front-door half.
CREATE TABLE affiliates (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants (id),
    party_id      uuid NOT NULL REFERENCES split_parties (id),   -- identity, destination, balance
    ref_code      text NOT NULL,                                  -- short, case-insensitive, theirs
    coupon_id     uuid REFERENCES coupons (id),                   -- optional second door
    status        text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','active','suspended','rejected')),
    manual_payout boolean NOT NULL DEFAULT false,                 -- merchant withholds outside Infi
    applied_at    timestamptz NOT NULL DEFAULT now(),
    approved_at   timestamptz,
    UNIQUE (tenant_id, lower(ref_code))
);

CREATE TABLE affiliate_clicks (              -- aggregate, never per buyer
    affiliate_id uuid NOT NULL REFERENCES affiliates (id),
    day          date NOT NULL,
    ua_class     text NOT NULL,              -- desktop | mobile | bot
    clicks       integer NOT NULL DEFAULT 0,
    PRIMARY KEY (affiliate_id, day, ua_class)
);

CREATE TABLE affiliate_commissions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants (id),
    affiliate_id  uuid NOT NULL REFERENCES affiliates (id),
    invoice_id    uuid NOT NULL REFERENCES invoices (id),
    allocation_id uuid REFERENCES invoice_allocations (id),   -- the ledger truth
    amount        numeric(20,2) NOT NULL,
    base_amount   numeric(20,2) NOT NULL,                     -- net of Infi's fee, for the receipt
    status        text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','available','paid','reversed')),
    available_at  timestamptz NOT NULL,
    reversed_reason text,
    UNIQUE (invoice_id)                                        -- one commission per sale, structurally
);

ALTER TABLE checkout_sessions ADD COLUMN affiliate_id uuid REFERENCES affiliates (id);
ALTER TABLE invoices          ADD COLUMN affiliate_id uuid REFERENCES affiliates (id);
```

`split_rules` gains one trigger kind, `{ "kind": "referral" }`, which fires on an invoice carrying
an `affiliate_id` and whose recipient is that invoice's affiliate. The allocator needs no other
change: it already resolves rules, computes on the net-of-fee base, persists an allocation and
reverses on refund. **`affiliate_commissions` is the state machine and the affiliate's statement;
`invoice_allocations` stays the money.** Two tables because the hold belongs to the program and
the ledger does not have opinions about it.

## Phasing

**P0 — attribution, with no money.** `/r/{code}`, the cookie, `affiliate_id` on the session and
the invoice, `affiliate_clicks`, the affiliate list with clicks and conversions, self-signup with
manual approval. **No commission is computed and none is owed.** *At the end:* a merchant can
recruit, hand out links, and see exactly who sold what — which is a product on its own, and the
one that proves the attribution before anyone is owed anything.

**P1 — commissions, held.** Requires Split P2 (`split_parties`, `party_payable`, party payouts).
The `referral` trigger, `affiliate_commissions` and its states, the hold sweep flipping `pending`
to `available`, reversal on refund and chargeback, self-referral refusal, the magic-link portal,
the minimum payout. *At the end:* an affiliate is paid to their own Pix key, 30 days after a sale
that stuck, with every ADR 0007 control in the way.

**P2 — the affiliate as a person with an income.** "Abrir minha conta", the annual informe de
rendimentos, the MEI nudge above a threshold, per-product and per-affiliate rates, a foreign
affiliate through `RemittanceSender`. *At the end:* the fiscal story is complete to the limit of
what Infi will say without being a tax engine.

**P3 — refused by default.** Tiers by volume, two-level (sub-affiliate) commissions, recurring
commissions on renewals beyond the first, a public affiliate marketplace, per-affiliate landing
pages, creative assets. Each is a separate decision; **two-level commission in particular is the
line where an affiliate program starts to look like a scheme**, and the answer is no.

P0 before P1 because attribution is the risky half and the money half is Split's, already
designed and reviewed. Shipping P0 first also means the first commission is computed over
attribution data the merchant has already been watching for weeks.

## Verification

- A click on `/r/{code}` sets a first-party cookie, 302s, and increments exactly one aggregate row;
  a bot user-agent lands in `ua_class = 'bot'` and never attributes a sale.
- A session created 29 days after the click attributes; 31 days after, it does not.
- A sale carrying both a cookie and an affiliate's coupon attributes **once**, to the coupon's
  owner, and `affiliate_commissions` has one row; the unique index refuses a second by construction.
- An affiliate buying through their own link (payer email or tax id matching) produces a `reversed`
  commission with the reason stated, never a `pending` one.
- A commission is `pending` at confirmation with `available_at = confirmed_at + hold_days`;
  the sweep flips it once and is idempotent under replay; a payout selector never sees `pending`.
- A refund inside the hold reverses the commission and the allocation in the same transaction as
  the provider reversal, **and no balance goes negative**; a refund after payout follows Split's
  negative-balance rule and is the only path that can.
- A suspended affiliate stops attributing immediately and every `pending` commission of theirs is
  reversed; `available` and `paid` ones are untouched.
- A payout to an affiliate's key passes `destination_ownership` on Split's party condition, holds
  once as a new destination, draws only on `party_payable`, and is refused against the owner's
  `psp_clearing`.
- A balance below `min_payout_amount` produces no payout and says why on the portal.
- The portal returns 403 for an unverified session; the code endpoint answers identically for a
  known and an unknown email (the enumeration argument from `infi-loyalty.md`, unchanged).
- An affiliate marked `manual_payout` never appears in an automatic payout batch and their balance
  is still correct.
- A `byop` tenant cannot activate a program and is told why, in the same words Split uses.
- The commission on a R$ 99 card sale is computed on the net of Infi's fee (R$ 93,35), matching
  Split's arithmetic exactly, and the affiliate's statement shows the base.

## Non-goals

**A second commission engine.** Every cruzeiro moves through Split's allocator, ledger and payout.
If this spec ever needs its own posting, the design is wrong.

**Withholding tax.** Infi does not compute or retain INSS, IRRF or ISS, and does not show a net
the merchant's accountant did not produce. `manual_payout` is the escape hatch. Infi Tax is
reserved (docs ADR 0008).

**Nota fiscal per affiliate.** The merchant is the merchant of record; Split already refused this
and the refusal carries.

**Two-level or multi-level commissions.** Named explicitly so nobody adds it as "one more field".

**Per-buyer click history, fingerprinting, cross-domain identity, pixels, postbacks.** Last click,
first-party cookie, one window. Everything else is a tracking company.

**Sharing one sale between two affiliates**, and recovering an attribution the cookie lost.

**Affiliates on `byop` or on the rail.** Same reason as Split: Infi holds no money there.

**Paying a commission in loyalty points.** That would be Infi settling a real debt in a unit only
the merchant honours.

## Open questions

1. **Counsel, question 3, at scale.** Split's open question, asked about hundreds of strangers
   paid monthly rather than a handful of declared partners. Blocks P1 go-live; not P1.
2. **Does the commission survive renewals?** A subscription sold by an affiliate: commission on
   the first invoice only, on every renewal, or for N months? The market's answer is "the first,
   unless the program says otherwise", and this spec has no rule kind for "N months" — Split's
   rules read the invoice and nothing else, on purpose. **Recommend first-invoice-only in P1**,
   and treat recurring commission as a rule-kind decision taken with Split, not around it.
3. **Is the commission base net of Infi's fee, or of the merchant's discounts too?**
   `commission_on_discounted` answers the second; the first follows Split and is not negotiable
   without changing Split.
4. **Does Infi charge for Affiliates?** Loyalty's open question 2 with more surface: attribution,
   payouts and an informe per affiliate are real cost. A per-payout fee is the honest shape and it
   is also the one an affiliate would notice.
5. **What happens to an affiliate's `pending` commissions when the merchant leaves Infi?** Split
   says the owner carries the negative; nobody has said who carries the pending.
6. **Should an affiliate be allowed to also be a buyer?** Self-referral is refused, but the same
   person buying later at full price is legitimate. Recommend: allowed, refusal keyed to the
   invoice's own attribution and nothing else.
