# Spec — Infi Loyalty: a points program in one screen

**Status:** spec (planned). No code. Verified against the three repos on disk 2026-09-07, plus
ADR 0002 (customer vs enrollment), ADR 0027 / ADR 0054 (a wallet balance is not money), ADR 0034
(take rate on approved volume), ADR 0049 (Infi's balance sheet is never in the path) and ADR 0061
(an invoice may bind to a payer). Companion to `tenant-contacts.md`, which refuses the CRM, and to
`checkout-custom-fields.md`, which drew the line this spec stays behind.

**The ask, stated literally:** *"uma forma fácil e rápida do meu cliente criar um programa de
pontos pra empresa dele."* Two adjectives and a noun. The adjectives are the requirement; the noun
is nearly free, because Infi already has every part of it except one.

## The decision in one line

**A point is not money.** It is a unit the merchant issues, that only the merchant honours,
redeemable only as a discount on that merchant's own checkout. It is never bought, never sold,
never transferred, never paid out, and never appears on the ledger in a currency.

That single sentence removes the whole regulatory surface of the category — a points balance that
can be cashed out is stored value, and stored value is a licence — and it is the same sentence
ADR 0049 already says about custody and ADR 0027 already says about the wallet. Everything below
is downstream of it.

## The reframe: a points program is three verbs and one balance

Merchants describe loyalty as a product. It is three rules:

| Verb | What it is | What Infi already has |
|---|---|---|
| **Earn** | on a confirmed payment, credit N points | `payment.confirmed` on the outbox, with a critical-consumer slot |
| **Hold** | a balance per buyer, append-only, idempotent | `wallet_entries` — the exact shape, wrongly keyed |
| **Burn** | reduce an open invoice by a fixed amount | `invoice.ApplyDiscount`, negative line + balancing posting |

Nothing else is required for a program that works. Tiers, referrals, reward catalogs, coalitions
and expiring lots are the second version of the product, and each of them is where a loyalty
feature turns into a loyalty company. They are named in Non-goals, once.

**What is genuinely missing is one thing: Infi cannot recognise a returning buyer.** A points
program is worthless if the person who earned the points cannot be identified on their next visit,
and `internal/identity` is staff-only — there is no buyer login anywhere in the backend. That gap,
and not the points arithmetic, is the real work in this spec.

## Verified facts (design constraints)

| Fact | Where |
|---|---|
| `wallet_entries` is append-only, `amount > 0`, `kind IN ('grant','consume')`, with a `seq` and a `wallet_checkpoints` roll-up — a working ledgerless balance engine | `000001_genesis.up.sql:1248-1259,1237-1244` |
| The wallet **explicitly does not touch the ledger**: *"A wallet balance is a count of a product's units, not money"* | `internal/wallet/wallet.go` Service doc; migration 000096; ADR 0027 |
| The wallet is keyed `(tenant_id, enrollment_id, balance_key)`, `enrollment_id NOT NULL`, and `balance_key` **must be a declared meter slug** — no default pool, no alias (ADR 0054) | `wallet_accounts`; `wallet.go` `ValidateMeter`, `BalanceKey` |
| Idempotency is a naming convention: references under `payment:`, `topup:`, `period:`, `migrate:`, `idem:` are deduped; free-form ones deliberately are not | `internal/wallet/wallet.go` `keyedReferencePrefixes` |
| `invoice.ApplyDiscount(tenantID, invoiceID, customerID, code, discount)` inserts a **negative `discount` line** on a finalized invoice, reduces the subtotal, and posts `debit revenue / credit receivable` | `internal/invoice/service.go:722-762`; `invoice.go:23-25` |
| **A coupon is percentage-only** (`PercentOff` string, `duration once/repeating/forever`), so a fixed-amount discount cannot be expressed as a coupon today — but the invoice layer under it already takes an amount | `internal/coupon/coupon.go:28-40` |
| Coupons already carry `MaxRedemptions`, `RedeemBy`, `TimesRedeemed` | `internal/coupon/coupon.go` |
| `POST /pay/{slug}/invoices/{invoiceID}/coupon` is **public and authorised by nothing but the invoice id** | `internal/checkout/handler.go:315,845-891` |
| An outbox `EventConsumer` is **best-effort — an error is logged, never failing the drain**; a `WithCriticalConsumer` runs inside the claim transaction, rolls the claim back on error so the event replays, and must perform no network I/O | `internal/outbox/publisher.go:41-47,101-108,172-179` |
| `payment.confirmed`, `payment.refunded` and `payment.chargeback` all carry `invoiceId` through the same payload map | `internal/invoicedoc/consumer.go:17-26` |
| `customers` is `(tenant_id, external_id, name, email, tax_id, psp_ref, country)` — **`email` and `tax_id` are both nullable**, no phone, no consent | `000001_genesis.up.sql:288-298` |
| **There is no buyer login.** `internal/identity` contains `doc.go` and `staff/` and nothing else | `internal/identity/` |
| An invoice may bind to a **payer** rather than an enrollment; `invoices.payer_id` already exists and `customer_id` is nullable | ADR 0061; `infi-store.md` |
| The platform take rate is charged on **approved volume**, with a per-payment floor | ADR 0034 |
| Nothing in the three repos mentions loyalty, fidelidade, cashback, pontos or rewards | grep over `backend`, `frontend`, `infi-sdk` |

Read together: Infi has a balance primitive it built for metering, a fixed-amount discount
primitive it built for coupons and then hid behind a percentage, an event pipeline with an
exactly-once slot, and no way to know who is standing at the checkout.

## Why not just reuse `wallet_*`

Tempting, and refused. `wallet_accounts.enrollment_id` is `NOT NULL`, and the buyer of a one-off
payment link has no enrollment; and ADR 0054 decided, on purpose and recently, that a balance key
**is** a meter slug, so there is no legitimate way to write `points` into it. Widening the wallet
to `(subject_kind, subject_id)` would put a migration and a branch in the metering hot path to
serve a feature with a thousandth of its write volume.

So: **a separate pair of tables with the same shape**, and one shared helper for the keyed-
reference idempotency rule so the convention has one implementation and not two. This is stated
out loud because a reviewer should be able to tell a deliberate copy from a missed abstraction —
the same courtesy `tenant-contacts.md` paid ADR 0056.

## The model

**One program per tenant.** Not per product, not per store. "Fácil e rápida" is the requirement,
and a merchant who needs two programs needs a different product than this one.

```sql
loyalty_programs        -- one row per tenant
  tenant_id, name,
  earn_points_per_unit     numeric  -- default 1.00  → 1 ponto por real
  redeem_units_per_point   numeric  -- default 0.01  → 100 pontos = R$ 1
  min_redeem_points        integer  -- default 100
  max_discount_percent     integer  -- default 50
  min_charge_amount        numeric  -- default 1.00, floor after discount
  inactivity_expiry_months integer  -- default 12, NULL disables
  currency                 char(3)  -- the program's currency, default BRL
  status                   text     -- draft | active | paused
```

```sql
loyalty_accounts   (tenant_id, customer_id, program_id)          -- unique
loyalty_entries    (account_id, seq, kind, amount > 0, reference, keyed, created_at)
                   -- kind: earn | redeem | expire | adjust | reverse
```

Balance is `earn + adjust − redeem − expire − reverse`, computed the way `wallet.Balance`
computes its own. No checkpoint table in P1: the wallet's exists because metering writes millions
of rows, and a loyalty account writes one per purchase. When that stops being true, the
checkpoint shape is already written down next door.

**References are keyed and namespaced**, borrowing the wallet's convention exactly:
`payment:<id>` for an earn, `invoice:<id>` for a redemption, `refund:<paymentID>` for a reversal,
`expire:<yyyy-mm>` for a sweep. A replayed outbox event, a retried request and a double-clicked
button all collapse onto one entry, and that is the whole idempotency design.

## Earn

A **critical consumer** on `payment.confirmed`, not a best-effort one. The publisher's own comment
draws the line: a plain `EventConsumer` failure is logged and dropped, and a silently missing
point is the one bug a loyalty program cannot survive — the merchant hears about it from the
buyer, weeks later, with no trace. Points are arithmetic over data already in the transaction, so
the "no network I/O" constraint on a critical consumer is satisfied by construction.

```
points = floor(paid_amount × earn_points_per_unit)
```

- **On the amount actually paid**, after every discount line, including a points redemption. Points
  do not earn points, and nobody farms the loop.
- **Only when `invoice.currency = program.currency`.** A different currency earns nothing and says
  so in the audit; multi-currency loyalty waits for the cross-border work
  (`cross-border-stablecoin.md`) to decide what a point is worth in dollars, which is a pricing
  question, not a schema one.
- **The customer is the invoice's payer** (ADR 0061) when set, else the enrollment's customer.
  One resolution, one place.
- A payment with no identifiable customer earns nothing. It does not fail.

**Refund and chargeback** reverse proportionally, `reference = refund:<paymentID>`, on the same
two events `invoicedoc` already consumes. **A balance may go negative**, because the points may
already have been spent, and Infi does not chase it: a negative balance simply earns back to zero
on the next purchase. This is the cheap answer and it is also the correct one — the alternative is
a collections process over a unit that is not money.

## Burn, and the problem that actually needs solving

Redemption itself is four lines: check `min_redeem_points`, cap the amount, call
`invoice.ApplyDiscount` with a fixed amount and `code = "loyalty"`, write a `redeem` entry in the
same transaction. The invoice layer already inserts the negative line and posts the balancing
movement. Coupons stay percentage-only and untouched; the fixed-amount door under them is the one
this uses.

**The authorisation is the hard part.** `POST /pay/{slug}/invoices/{id}/coupon` is authorised by
possession of the invoice id, which is correct for a coupon — a code is a bearer secret. It is not
correct for spending a named person's balance, and it is not even correct for *reading* one:
an endpoint that answers "how many points does ana@example.com have?" is an email-enumeration
oracle that tells a stranger who buys from this merchant. **The read is the leak, which is why
verification is in P1 and not deferred.**

So:

1. The buyer types their email on the checkout's contact step, as they do today.
2. If that email matches a `customers` row with a loyalty account, the checkout offers
   *"Você tem pontos aqui. Ver saldo"* — **and says nothing about whether the email is known**
   until step 4.
3. `POST /pay/{slug}/sessions/{id}/loyalty/verify` mails a 6-digit code, valid 10 minutes, 5
   attempts, rate-limited per session and per email like `/public/v1/claimables`. It responds
   identically whether or not the email is known.
4. The verified code binds the session to that customer. Only then is the balance returned, and
   only then can `POST /pay/{slug}/invoices/{id}/loyalty/redeem` spend it — against that session's
   own invoice, never another.

This is the smallest possible buyer identity: scoped to one checkout session, expiring with it, no
account, no password, no `internal/identity` change. It is also the piece that makes the second
purchase feel like a program rather than a form, and it is reusable by anything that later needs
to recognise a buyer.

**Two caps, and the reason is not fraud.** A redemption never takes the invoice below
`min_charge_amount`, and never covers more than `max_discount_percent`. An invoice at zero has no
payment; with no payment there is no `payment.confirmed`; with no `payment.confirmed` there is no
receipt, no fulfillment (ADR 0036), no metering and no earn. The entire downstream is welded to a
payment existing, and a fully-discounted invoice quietly severs all of it. The percentage cap is
the merchant's economics; the floor is Infi's correctness.

## Where the points *are not*

- **Not on the ledger.** No account, no currency, no posting. The redemption posts — as a
  discount, `debit revenue / credit receivable`, exactly as a coupon does — because a loyalty
  redemption is a price reduction, not a payment. That is also the honest accounting: the merchant
  gave up revenue.
- **Not on the payout path.** Nothing in `internal/treasury` learns the word.
- **Not affected by collection mode.** `managed` and `byop` differ in whose account the money
  lands in, and points touch no money, so Loyalty ships identically in both. Worth stating because
  every other recent spec has had to branch on it.
- **Not Infi's liability.** Outstanding points are an obligation of the merchant to their buyer.
  Infi funds none, buys none back, converts none. ADR 0049's sentence, restated for a new noun.

**One consequence to decide, not to hide:** the platform take rate is charged on approved volume
(ADR 0034), and a redemption reduces approved volume, so Infi earns less on a discounted invoice.
That is already true of coupons and nobody has objected; it is listed as an open question because
loyalty makes it systematic rather than occasional.

## The merchant surface — this is the feature

Everything above is plumbing. What was asked for is *fácil e rápida*, so:

**One dashboard screen** at `(dashboard)/loyalty`. A toggle, four pre-filled fields, and a live
sentence in Portuguese that restates them: *"Ana ganha 1 ponto por real. 100 pontos viram R$ 1 de
desconto. Pontos expiram após 12 meses sem compras."* Changing a field rewrites the sentence. A
merchant who touches nothing has a working 1%-back program in one click, which is the default
because it is the one most Brazilian small merchants run.

**Zero checkout work.** Once the program is active, every checkout shows the earn line on the
summary — *"Você vai ganhar 240 pontos"* — with no per-link configuration. A per-link opt-out
exists; the default is on. This is the opposite of the contacts spec's opt-in default, and
deliberately: capturing a buyer's data needs consent, giving a buyer points does not.

**The receipt email carries the balance.** One line appended to the template that already goes out
on every purchase: *"Seu saldo: 1.240 pontos."* No new channel, no campaign tool, no consent
question — it is a transactional receipt the buyer already receives. This is the cheapest
retention loop that exists and Infi is one template edit away from it.

**An API for the points Infi cannot see.** The merchant's own app knows things the checkout never
will: a visit to the store, a referral, a review, a birthday.

```
POST /loyalty/points        { customer, points, reason, reference }   → adjust
GET  /loyalty/customers/{id}                                          → balance + history
POST /loyalty/programs      { … }                                     → billing-as-code
```

`infi.loyalty.grant()`, `.balance()`, `.redeem()` in the SDK, and the program itself declarable
alongside products in `billing-as-code.md`'s shape. **This single grant endpoint is what makes it
"um programa pra empresa dele" instead of "pontos nas vendas pela Infi"**, and it costs one
handler. Webhooks `loyalty.points.earned` and `loyalty.points.redeemed` join the existing 26.

## Expiry

**By inactivity, not by lot.** A sweep expires an account's whole balance after
`inactivity_expiry_months` with no earn, in one `expire:<yyyy-mm>` entry, with a warning email 30
days before. FIFO expiry of individual point lots needs per-lot tracking, a consumption order and
a UI that explains it, and it buys the merchant nothing they asked for. Named here so the choice
is visible, refused in Non-goals.

## Phasing

**P0 — the program earns.** `loyalty_programs`, `loyalty_accounts`, `loyalty_entries`, the
critical consumer on `payment.confirmed`, refund reversal, the dashboard screen, the earn line on
the checkout, the balance line on the receipt. **No redemption.** *At the end:* a merchant turns it
on and buyers start accumulating; the merchant can announce the program before it can be spent,
which is how loyalty programs are launched anyway.

**P1 — the buyer spends.** Session-scoped email verification, balance read, the redeem endpoint
with both caps, the redemption row on the invoice, `loyalty.points.redeemed`. *At the end:* Ana
buys a second time and pays R$ 12 less.

**P2 — the merchant's own points.** `POST /loyalty/points`, the SDK surface, the webhooks, the
billing-as-code declaration, the inactivity sweep and its warning email. *At the end:* the program
covers what happens off the Infi checkout.

**P3 — deferred by default.** Tiers, referral codes, a reward catalog, more than one program,
points on subscription renewals as a distinct rule. Each is a separate decision and none blocks
the three above.

P0 ships without the identity work, which is the reason it is P0: the hardest piece in this spec
buys nothing until there is a balance worth spending.

## Verification

- A confirmed R$ 100 payment on a `1.00` program writes one `earn` of 100; **replaying the same
  outbox event writes nothing more**, and the balance is still 100.
- A payment confirmed while the loyalty consumer errors **does not mark the outbox event
  published**, and the next drain earns exactly once — the critical-consumer contract, asserted.
- An invoice discounted by a coupon earns on the discounted amount, not the subtotal.
- A redemption earns nothing at all, and a redeem-then-earn cycle cannot increase a balance.
- A full refund of that payment writes one `reverse` of 100; a 40% partial writes 40; the balance
  goes negative when the points were already spent, and the next purchase earns it back.
- A payment in a currency other than the program's earns nothing and records why.
- A payment whose invoice binds to a payer (ADR 0061) credits the payer's account, not an
  enrollment's.
- `POST /sessions/{id}/loyalty/verify` responds **identically** for a known and an unknown email,
  in indistinguishable time; a wrong code five times burns the challenge; a code from another
  session is refused.
- The balance endpoint returns 403 for an unverified session, always, including when the email is
  unknown.
- A redemption of 5 000 points on a R$ 60 invoice with `max_discount_percent = 50` discounts
  R$ 30, not R$ 50; the invoice never falls below `min_charge_amount`; a redemption that would
  zero an invoice is refused with a stated reason.
- A redemption spends and discounts **in one transaction**: a failure on either side leaves no
  entry and no discount line, asserted by injecting a failure between them.
- Redeeming against an invoice the verified session does not own is refused.
- The invoice shows one `discount` line, and the ledger shows the matching `debit revenue /
  credit receivable` and **no posting in any account named `points`**.
- The inactivity sweep expires exactly once per account per month and is idempotent under replay.
- A tenant with no program, or a paused one, changes nothing anywhere: no line on the checkout, no
  entry, no email line.

## Non-goals

**Cashback in money.** A point that converts to reais is stored value and a licence. If the
merchant wants to give money back, that is a discount or a refund, both of which exist.

**Transferring, selling, gifting or pooling points**, between buyers or between merchants. A
coalition program is a different company and a regulated one.

**Points as a payment method.** Not on the checkout's method list, not on the rail, not on an
invoice as a payment. A redemption is a discount before payment, always.

**A reward catalog Infi fulfils.** Choosing, stocking and shipping a reward is the merchant's;
`digital-delivery.md` already delivers what the merchant sells, and a reward can simply be a
product priced at R$ 0.01 with a coupon.

**FIFO lot expiry, tiers, referrals, gift cards, birthday rules, campaign scheduling,
segmentation, push notifications, a buyer-facing account page, and negative-balance collection.**
Each is a real feature of a real loyalty product and none of them is what makes this one work.

**An affiliate program.** A point is a unit the merchant honours; an affiliate commission is
**money leaving the merchant to a third party**, which means `payouts`, the seven ADR 0007 rules,
a destination that is by definition not the tenant's own tax id, and the ledger allocation Infi
Split already models. Same word "recompensa", opposite money path. It is its own track and it
never lands in `loyalty_entries` — a commission paid in points would be Infi settling a debt in a
unit only the merchant honours.

**A buyer login.** P1 adds a session-scoped verification, not an account. If Infi ever needs real
buyer identity, that is its own ADR and `internal/identity` is where it goes.

## Open questions

1. **Does Infi's take rate follow the discount down?** ADR 0034 meters approved volume, so a
   redemption reduces Infi's revenue on that payment. Already true for coupons; loyalty makes it
   routine. Bill on pre-discount volume, accept the reduction, or price Loyalty separately?
2. **Is Loyalty a paid feature?** A flat monthly add-on, a percentage of redeemed value, or free
   because it increases the volume the take rate is charged on. The third is the mission-aligned
   answer and the one that needs no billing work.
3. **Does a subscription renewal earn?** Recurring revenue earning points is either the most
   valuable case or an unintended free discount treadmill, depending on the merchant's margin.
   Recommend: earns, with a per-program toggle, decided before P0 ships.
4. **One program per tenant, or per store/product?** This spec says one. `infi-store.md` and
   `infi-catalog.md` may disagree once a tenant runs several storefronts.
5. **What happens to points when the merchant deletes the customer?** `tenant-contacts.md` gives
   the merchant a delete they can exercise at will; deleting the person must not leave an orphan
   balance, and the entries are also the audit trail of a discount already given. Recommend:
   anonymise the account, keep the entries.
6. **Does the buyer see their balance anywhere outside a checkout?** The receipt line covers it
   cheaply. A hosted balance page needs the buyer login this spec refuses.
7. **Should the earn line appear before the buyer identifies themselves?** Showing *"Você vai
   ganhar 240 pontos"* to an anonymous visitor is a reason to identify; showing it after is a
   reason to come back. This spec shows it always. Cheap to reverse.
