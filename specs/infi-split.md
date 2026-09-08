# Spec — Infi Split (formerly Infi Share): one sale, N recipients, on the managed rail

**Status:** spec (planned). No code. Verified against the three repos on disk 2026-09-07, including
branch `feat/managed-collection-mode` (migrations `000015`, `000016`). **Infi Share is Infi Split**: this supersedes
`backend/docs/superpowers/specs/2026-08-20-infi-share-split-design.md`, the earlier draft of the same
product, whose rule vocabulary and `Allocation` shape this keeps and whose refusal of the "platform
topology" this revisits under ADR 0031. Related: `specs/cross-border-stablecoin.md`
(managed payouts to a Pix key or a USDC wallet), `specs/infi-store.md` (an invoice with N lines,
ADR 0061), docs ADR 0005 (split requires custody), docs ADR 0006 (Infi becomes a provider).

**Product decision (2026-09-07, product owner):** Split is **exclusive to the `managed` collection
mode**, and `managed` is the product: **`byop` is hidden and offered to enterprise accounts only.** Three shapes: **teams of tenants** (one product's revenue divided among N tenants, or an
invoice whose products belong to N tenants), **co-founders** (people inside one tenant sharing its
revenue), and **sales commissions**. Each recipient is paid to a bank account or a USDC wallet.

## The claim

A merchant on `managed` opens Split, creates a team, invites a co-founder by email and a partner
tenant by slug, and writes two rules on the PRO plan: 60% to herself, 40% to the co-founder. A
buyer pays R$ 99 for the plan. The payment detail shows a **Distribution** card: R$ 59 to her
bank account, R$ 40 to his USDC wallet, Infi's fee already off the top. Next month the renewal
does the same without anyone touching it. A refund reverses both shares. Nobody at Infi moved
money by hand, and nobody signed anything on a chain.

## Why managed, and why the old refusal no longer holds there

Infi Share (2026-08-20) studied three topologies and refused the one where a charge lands in a
platform account and fans out to N recipients, for two reasons: holding and redistributing
third-party funds is regulated, and a chargeback on a split charge debits the platform. It kept
two topologies that need no custody: the PSP's native split (Asaas `walletId` per member) and
decomposition into N charges. Both require every recipient to hold a provider account, and the
first pins a team to Asaas.

Two things changed. **ADR 0031 built the platform account on purpose.** A managed tenant's charges
run on Infi's own provider accounts, Infi's fee is netted in the ledger at confirmation, the
tenant's balance *is* a ledger account (`psp_clearing`), and payouts leave Infi's account to the
key the dossier declared. The custody Infi Share refused is the custody Managed accepted, behind a
reviewed dossier, and the chargeback exposure Share feared is already Managed's: a chargeback on
a managed charge debits Infi's account and is recovered from the tenant's clearing balance. **Docs
ADR 0005 said it first:** revenue sharing that survives refunds and pays D+N is "executor B":
capture → a nominal account per party → **Infi's ledger allocates** → transfer. That executor
needs custody; Managed is that custody, at a licensed provider, under Infi's account.

So Split on `managed` is not a new topology. The money is already in one place. Splitting is
**an allocation in the ledger and payouts to N destinations**, both of which exist. On `byop` the
money is in the merchant's own account and Infi cannot allocate what it does not hold; Share's
peer and decomposition topologies remain the only options there, and they stay unbuilt until a
merchant asks and can say why.

## Design principles

- **Split is allocation, not movement.** A confirmed payment credits the owner's clearing account
  as today; the allocation then moves value **between ledger accounts inside Infi's book**, and
  each recipient is paid by the payout path that already exists. No new money-out mechanism.
- **Rules are resolved once, at confirmation, and the result is persisted.** Rules change; a
  settled sale must be explainable with the rules in force when it settled (Share §9).
- **Shares are computed on the amount net of Infi's fee.** The fee is posted first (ADR 0031);
  what is divided is what the team actually has. Projected net per recipient is shown before a
  rule is saved, because Share §7's trap is real: a fixed share on a small ticket can leave the
  owner with less than the rule reads.
- **A recipient is a tenant, or a party.** A tenant recipient has a dossier, a ledger and a
  payout key already; its share is a credit on its own clearing account. A party is a person the
  owner pays; it has a verified destination and a balance held **on the owner's book**.
- **A destination is verified by the person who owns it**, never typed by whoever holds the
  owner's session. ADR 0007's ownership rule refuses a payout to a tax id that is not the
  tenant's for a reason; a party's key passes only because the party confirmed it themselves.
- **Reversal follows the allocation.** A refund or chargeback reverses every share in proportion;
  what was already paid out becomes a negative balance netted against the recipient's next
  shares, and the owner is liable for what never nets. Written into the team agreement, shown on
  the screen, never discovered in reconciliation.
- **The owner is the merchant of record.** One invoice, one payer, one receipt, one nota fiscal
  problem (Share §10, still not designed). Recipients receive revenue shares from the owner.

## Verified facts (design constraints)

| Fact | Where |
|---|---|
| Managed tenants collect on Infi's own accounts (`infi`, `infi_woovi`, `infi_efi`, `infi_stripe`), routed as peers | ADR 0031 and its 2026-09-06 amendment |
| The take rate (5% + R$ 0,70, BRL only) is posted at confirmation as `platform_fee` against `psp_clearing`, so the tenant's clearing balance is net from the first second | `internal/collectionmode/fee.go`; `internal/ledger/ledger.go:26-29`; ADR 0031 |
| A managed tenant's balance and statement **are the ledger**: `psp_clearing` minus queued payouts | ADR 0031 |
| A managed payout is a request parked `pending_approval` with `hold_reason = managed_manual`, completed by staff by hand, and **may only name the dossier's payout key** | ADR 0031; migration `000016` |
| The ledger holds money **at tenant level**, `ledger_accounts (tenant, kind, currency)`; per-party detail belongs in product tables (the "subsidiary ledger") | ADR 0027; `genesis.up.sql` |
| `Poster.Post` checks debits = credits and refuses non-positive legs | `internal/ledger/ledger.go:62-80` |
| Payout controls: per-payout max, daily cap, velocity, blocked destination, **ownership** (CPF/CNPJ must be the tenant's; EMAIL/PHONE/EVP hold 24h), approval threshold, new destination; precedence fixed; ids stable | ADR 0007; `internal/treasury/rules/rules.go` |
| Tenant members are `users (tenant_id, external_subject, email, role)` with **no tax id and no destination** | `genesis.up.sql:1216` |
| A tenant can be prepared and claimed by email (claimables) | ADR 0003, 0058, 0059 |
| `coupon_redemptions` records `(coupon_id, customer_id, invoice_id)` | `genesis.up.sql` |
| An invoice line will name its product (`invoice_line_items.product_id`), and an invoice may bind to a payer | ADR 0061 (proposed); `specs/infi-store.md` |
| Subscription renewals produce ordinary invoices through `billing.BillOpenPeriod`, paid through the same `payment.confirmed` event | `internal/checkout/handler.go:1100-1115`; outbox |
| `payment.refunded` / `payment.chargeback` are emitted with amount and `accessRevoked`; a partial refund leaves the sale standing | ADR 0032; `openapi.yaml:5093-5105` |
| Managed payouts may target a Pix key today and, per the cross-border spec, a USDC wallet through `RemittanceSender` | `specs/cross-border-stablecoin.md` |
| Infi Share defined rule kinds `fixed_per_unit`, `percent_of_item`, `percent_of_total`, `floor_plus_excess`, and a persisted `Allocation{Items[], Total}` | Share design §6–§7, §9 |
| Infi Share named the product **"Infi Split"** as the term the market types | Share design §13.1 |

## The objects

```
split_teams          one owner tenant, many members; the agreement lives here
split_team_members   a tenant (by id) or a party (by id); status invited | active | suspended
split_parties        a person the owner pays: name, email, tax_id, verified destination, balance
split_rules          scope (product | team), recipient, kind, value, trigger, priority
invoice_allocations  the resolved allocation, one row per (invoice, recipient), persisted
```

### Teams and members

A **team** belongs to one managed tenant, the owner. Members are invited by **slug** (a tenant) or
by **email** (a party). A tenant member must itself be `managed`: its share credits its own
ledger, and only a managed tenant has one that Infi can credit. A `byop` tenant invited to a team
is told why it cannot accept, and what to do.

A **party** is a person the owner pays a share of revenue to: a co-founder, a salesperson, a
partner without a company. Inviting one creates the row with name and email; the party then
**accepts**: confirms identity (CPF, birth date), reads the team agreement, and **enters their own
destination**, a Pix key or a wallet address they prove control of by signature. The destination
is theirs because they typed it in their own session, on their own device, after their own email
link. The owner can suspend a party and can never edit its destination.

**A party can become a tenant.** The acceptance page offers "abrir minha conta na Infi"; the
claimable-tenant path (ADR 0058) already prepares one from an email. If they do, the member row
flips from party to tenant, the party's balance transfers to the new tenant's clearing account,
and every rule pointing at the party now points at the tenant. This is how a commission-earning
salesperson becomes, in the mission's words, an entrepreneur with their own income sources,
without re-signing anything.

### Rules

Share's four kinds, unchanged, plus scope and trigger:

```jsonc
{
  "scope":     { "kind": "product", "productId": "…" },   // or { "kind": "team" } = every sale of the owner
  "recipient": { "kind": "party", "id": "…" },            // or { "kind": "tenant", "id": "…" }
  "kind":      "percent_of_item",                         // fixed_per_unit | percent_of_item | percent_of_total | floor_plus_excess
  "value":     "40",
  "trigger":   { "kind": "always" },                      // or { "kind": "coupon", "couponId": "…" }
  "priority":  10
}
```

`trigger.coupon` is the sales commission: the rule fires only on invoices where that coupon was
redeemed, which is how a code becomes a salesperson's attribution. It closes the money half of
"who referred them" that `checkout-custom-fields.md` deferred, without a referral object: one
coupon per salesperson, one rule per coupon.

**Resolution order** is fixed and tested: product-scoped rules resolve per line, in priority
order; team-scoped rules resolve over the remaining net; the **residual goes to the owner**.
Rounding is largest-remainder, deterministic, remainder to the owner. A rule set whose shares
exceed 100% of any base is refused **at save**, not at settlement.

**The base is net of Infi's fee.** On a R$ 99 card sale under Managed, the fee is R$ 5,65; the
team divides R$ 93,35. The rule screen shows this: "on a R$ 99 sale, Sarah receives R$ 56,01 and
Marcus R$ 37,34". A `fixed_per_unit` share is deducted before percentages, and the screen shows
the owner's residual going below their nominal percentage when it does.

### Allocation

At `payment.confirmed` on a managed payment, after the platform fee is posted and in the same
transaction, the allocator loads the invoice's lines (with `product_id`), the owner's active
rules, the coupons redeemed on the invoice, and produces one `invoice_allocations` row per
recipient: `amount`, `reason` (the product or the rule), `source_rule_id`, `source_line_item_id`.
Persisted, immutable, shown on the payment detail as the Distribution card.

Then the ledger moves, all legs BRL, all balanced:

```
owner   psp_clearing  ─debit  56.01─▶  party_payable(owner)     credit 56.01    # Sarah, a party
owner   psp_clearing  ─debit  37.34─▶  psp_clearing(partnerCo)  credit 37.34    # a tenant member
```

`party_payable` is a **new tenant-level account kind**: what the owner owes its parties in
aggregate. The per-party detail is `split_parties.balance`, maintained by the same transaction,
which is the subsidiary ledger ADR 0027 asks for. A tenant recipient needs no new kind: the value
crosses from one tenant's clearing account to another's, inside Infi's book, and shows up in the
recipient's balance exactly as their own sale would, tagged with the owner and the reason.

### Payout

**Tenant recipients** are paid as they already are: their managed payout, to their dossier key,
on ADR 0031's path, from their own balance. Nothing new.

**Parties** are paid by the owner's tenant, from `party_payable`, to the party's verified
destination, through the same treasury path (`Decide`, the seven rules, `executeTransfer`,
ledger welded to acceptance). Two changes to the rules:

- `payout.destination_ownership` gains a second passing condition: the destination is the
  **verified destination of an active party of this tenant**. The fingerprint blocklist and the
  new-destination hold apply as to any key; the first payout to a party holds once.
- A payout whose destination is a party's may only draw on `party_payable`, never on the owner's
  `psp_clearing`. The reverse is also true. A party's balance is not the owner's money to spend
  and the owner's balance is not the party's.

Cadence follows the cross-border spec's managed payout: `settle_after` / `settle_at_amount`,
defaulting to daily with a floor. A party's destination may be a Pix key (BRL, `PixPayer`) or a
USDC wallet (`RemittanceSender`, `purpose = revenue_share`, a new purpose in that spec's enum).
The image's "40% → USDC Wallet" is that row.

### Reversal

A full refund or chargeback reverses the allocation in the same transaction that records the
reversal: each recipient's credit is debited back to the owner's clearing account, which is then
debited by the provider's reversal as today. A recipient whose share was already paid out goes
**negative**, and the negative nets against their next allocations from this owner. A partial
refund reverses proportionally. A party or tenant that leaves the team with a negative balance
leaves the owner holding it; the agreement says so, and the owner sees it before approving the
member. Infi advances nothing and forgives nothing.

### Subscriptions and renewals

A rule on a subscription product applies to every invoice that product bills, first period and
renewals alike, because renewals are ordinary invoices confirmed by the same event. A rule added
mid-life applies from the next confirmation; the persisted allocations of past cycles do not
change. Card instalments (Share §8's twelve-month trap) do not exist on Managed card today; if
they arrive, a share follows the parcelas and the screen says so.

## Multi-tenant catalog: one product, N tenants

Two shapes the product owner named, and they are the same mechanism seen from two ends.

**One product's revenue divided among N tenants.** The owner's product, rules with tenant
recipients. Built above; nothing more.

**One invoice with products of N tenants.** A cart (`infi-store.md` P2) whose lines belong to
different tenants. The invoice is the owner's; each line names its product; a product **owned by a
team member and shared into the team** carries an implicit rule: 100% of that line's net to its
owner, minus whatever team rule the owner and member agreed (a marketplace fee, say). This needs
one thing the store spec does not have: `store_items` may reference a product from another tenant
**only if that product is shared into a team the store owner belongs to**, with the member's
consent recorded on `split_team_products` (Share §9's shared catalogue, with `price_policy`: who
may set the sale price). It is P3 here because it is the one shape that needs a consent flow and
a pricing floor, and the first two do not.

## Dashboard

A **Split** module, visible only on a `managed` tenant. Four screens and one card:

- **Teams**: create, name, agreement text (ours, versioned, with the owner's additions), members
  with status, invite by slug or email.
- **Rules**: per product or team-wide, with the projected-net preview on a sample sale.
- **Members' statements**: what each recipient has been allocated, paid, reversed, and their
  current balance, exportable.
- **Party acceptance** (public, by email link): identity, agreement, destination, and the "abrir
  minha conta" offer.
- On **Payment detail**: the Distribution card from the image, one row per recipient, with the
  destination kind and the payout status.

The projected-net preview and the Distribution card are the two places Share's fee trap becomes
visible, and they are not optional.

## Schema and core changes

```sql
CREATE TABLE split_teams (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_tenant_id uuid NOT NULL REFERENCES tenants (id),
    name            text NOT NULL,
    agreement_version text NOT NULL,                 -- our text, versioned like the mandate
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE split_parties (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants (id),  -- the owner
    name            text NOT NULL,
    email           text NOT NULL,
    tax_id          text,                                  -- CPF, digits; set by the party at acceptance
    destination     jsonb,                                 -- {kind: pix|wallet, ...}; set by the party, never by the owner
    destination_verified_at timestamptz,
    accepted_at     timestamptz,
    agreement_version text,
    balance         numeric(20,2) NOT NULL DEFAULT 0,      -- subsidiary ledger of party_payable; may go negative
    status          text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended')),
    became_tenant_id uuid REFERENCES tenants (id),          -- set when the party claimed a tenant
    UNIQUE (tenant_id, lower(email))
);

CREATE TABLE split_team_members (
    team_id          uuid NOT NULL REFERENCES split_teams (id) ON DELETE CASCADE,
    member_tenant_id uuid REFERENCES tenants (id),
    member_party_id  uuid REFERENCES split_parties (id),
    status           text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended')),
    invited_at       timestamptz NOT NULL DEFAULT now(),
    accepted_at      timestamptz,
    CHECK ((member_tenant_id IS NULL) <> (member_party_id IS NULL)),
    PRIMARY KEY (team_id, COALESCE(member_tenant_id, member_party_id))
);

CREATE TABLE split_rules (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id             uuid NOT NULL REFERENCES split_teams (id) ON DELETE CASCADE,
    product_id          uuid REFERENCES products (id),      -- NULL = team scope
    recipient_tenant_id uuid REFERENCES tenants (id),
    recipient_party_id  uuid REFERENCES split_parties (id),
    kind                text NOT NULL CHECK (kind IN ('fixed_per_unit','percent_of_item','percent_of_total','floor_plus_excess')),
    value               numeric(20,8) NOT NULL CHECK (value > 0),
    trigger_coupon_id   uuid REFERENCES coupons (id),      -- NULL = always
    priority            integer NOT NULL DEFAULT 100,
    active              boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((recipient_tenant_id IS NULL) <> (recipient_party_id IS NULL))
);

CREATE TABLE invoice_allocations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants (id),   -- the owner
    invoice_id          uuid NOT NULL REFERENCES invoices (id),
    payment_id          uuid NOT NULL REFERENCES payments (id),
    recipient_tenant_id uuid REFERENCES tenants (id),
    recipient_party_id  uuid REFERENCES split_parties (id),
    amount              numeric(20,2) NOT NULL,                    -- negative rows are reversals
    currency            character(3) NOT NULL,
    reason              text NOT NULL,
    source_rule_id      uuid REFERENCES split_rules (id),
    source_line_item_id uuid REFERENCES invoice_line_items (id),
    ledger_transaction_id uuid NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((recipient_tenant_id IS NULL) <> (recipient_party_id IS NULL))
);
CREATE INDEX invoice_allocations_recipient_idx ON invoice_allocations (recipient_tenant_id, created_at);
CREATE INDEX invoice_allocations_party_idx     ON invoice_allocations (recipient_party_id, created_at);

-- P3: the shared catalogue
CREATE TABLE split_team_products (
    team_id         uuid NOT NULL REFERENCES split_teams (id) ON DELETE CASCADE,
    product_id      uuid NOT NULL REFERENCES products (id),
    owner_tenant_id uuid NOT NULL REFERENCES tenants (id),
    price_policy    text NOT NULL CHECK (price_policy IN ('owner_sets','seller_sets_above_floor','seller_sets')),
    floor_price     numeric(20,2),
    consented_at    timestamptz NOT NULL,
    PRIMARY KEY (team_id, product_id)
);
```

Core: a new ledger account kind `party_payable`; the allocator as a step in the managed
confirmation transaction after the fee; the reversal step in `recordReversal` (ADR 0032's
function); `payout.destination_ownership` gaining the party condition; a payout `destination`
of kind `party` that resolves to the party's verified destination and draws on `party_payable`;
`purpose = revenue_share` in the remittance enum; `ProductDisplay` unchanged; `payments`
detail read gains `allocations[]`. **Byop is untouched**: the allocator runs only when
`payments.provider` is one of Infi's own accounts, which is the same predicate the fee uses.

## Regulatory frame, stated once

Managed already makes Infi the account holder and the party the provider knows; the dossier is
the price (ADR 0031). Split adds one fact: from that account Infi pays **people who are not the
merchant of record**. Counsel's question 3, beside the two the cross-border spec left open: does
distributing a merchant's revenue to its declared partners, from Infi's account, at the
merchant's instruction, change Infi's classification under the payment-arrangement rules for
sub-acquirers and facilitators, and does a party need more than a CPF and a confirmed key. The
design does not depend on the answer, only on the party being verified and the owner being the
one who instructs. **P1 does not go live before it is answered; P1 is built regardless.** What
Infi does not do is unchanged: no advance, no float, no rate, no key.

## Phasing

**P1 — teams of tenants.** Teams, tenant members, product and team rules with `always` trigger,
the allocator, inter-tenant ledger legs, reversal, the Distribution card, projected-net preview,
statements. No party, no new payout path: every recipient is a managed tenant paid as today. *At
the end:* two managed tenants share one product's revenue on every sale and every renewal, and a
refund undoes it.

**P2 — parties and commissions.** `split_parties`, the acceptance page with identity, agreement
and self-entered destination, `party_payable`, the ownership rule's party condition, payouts to
parties (Pix first, wallet when the cross-border spec's `RemittanceSender` lands), coupon
triggers, "abrir minha conta" with balance transfer. *At the end:* the claim holds: co-founder and
salesperson paid on each sale, on their own key, with every ADR 0007 control in the way.

**P3 — the shared catalogue.** `split_team_products`, consent and price policy, store items from
team members, the implicit 100%-to-owner line rule. *At the end:* a store sells a partner's product
and the partner is paid for it without an invoice between them.

P1 first because it has no new destination and no new KYC: it is allocation between two ledgers
Infi already keeps. P2 is where a person who is not a merchant enters, which is where the counsel
question and the destination verification live.

## Verification

- A rule set summing to 110% of a base is refused at save with the offending rules named.
- R$ 99 by card under Managed: fee R$ 5,65 posted first; 60/40 rules produce R$ 56,01 and
  R$ 37,34; the remainder rounding goes to the owner; `invoice_allocations` has two rows and the
  ledger transaction balances.
- The same product renewed next month allocates again; a rule changed in between applies only to
  the second allocation and the first's rows are unchanged.
- A tenant recipient's balance page shows the share, tagged with the owner and reason; its
  managed payout draws on it as on its own sales.
- A `byop` tenant invited to a team cannot accept and is told why.
- Party acceptance: the destination cannot be set from the owner's session (403); the party sets
  it after the email link; the owner's later attempt to edit it is refused.
- First payout to a party holds as a new destination; the second does not; a payout to a party's
  key from the owner's `psp_clearing` is refused, and one to the owner's key from `party_payable`
  is refused.
- Full refund: both allocations reversed in the same transaction as the provider reversal; a
  party already paid goes negative and the next allocation nets to zero before anything is
  payable; a partial refund reverses proportionally.
- A commission rule with a coupon trigger fires on an invoice where the coupon was redeemed and
  not on one where it was not.
- A party who opens a tenant sees its balance move to the new tenant's clearing account and the
  rule now names the tenant; the party row is kept with `became_tenant_id`.
- The Distribution card and the projected-net preview show the same numbers for the same sale.

## Non-goals

**Split on `byop`.** Infi does not hold the money there. `byop` is hidden and enterprise-only
(2026-09-07); Share's peer (Asaas `walletId`) and decomposition topologies are the only way to split
there, and they are built only if an enterprise account asks and pays for them.

**Advancing a share, or any float.** A recipient is paid when the owner's balance is; Infi fronts
nothing (ADR 0049).

**Forgiving a negative balance.** The owner carries it, by agreement.

**Nota fiscal per recipient.** The owner is the merchant of record; each recipient's fiscal
treatment of a revenue share is theirs. Infi Tax is reserved (docs ADR 0008).

**Rules that read anything but the invoice.** No tiers by volume, no time-based vesting, no
conditions on the buyer. Four kinds, two scopes, one trigger.

**Editing a settled allocation.** Reversal is the only write after confirmation.

**Split on the rail.** Rail settlements name the merchant's wallet in a signed authorization;
there is no account to allocate from. Unchanged from ADR 0049.

## Open questions

1. **Counsel, question 3** (above). Blocks P1 go-live; not P1.
2. **What must a party prove?** CPF and a self-entered key in v1. Whether a party paid above some
   monthly amount needs the PF dossier the cross-border spec's open question 6 describes is the
   same decision as whether Managed admits PF tenants at all; take them together.
3. **Chargeback holdback on card.** Under Managed, card shares are payable on the same cadence as
   Pix, and a chargeback ninety days later nets against future shares or lands on the owner.
   A per-method holdback (`settle_after` longer for card) is a knob the team could set; default
   none, to keep the promise in the image honest.
4. **Fee attribution.** Net-of-fee means every recipient pays Infi's fee proportionally. A team
   may prefer the owner to absorb it. One boolean on the team, default proportional.
5. **Can a party belong to teams of two owners?** The row is per owner tenant, so a salesperson
   selling for two merchants is two parties with one CPF. Fine for v1; a person-level identity
   across tenants is the claimable tenant, and that path exists.
6. **Does the party's balance need its own currency dimension?** BRL only while Managed is BRL
   only; the column is `numeric(20,2)` with the owner's currency implied, and a second currency
   is a second row when the cross-border spec's managed USD lands.
