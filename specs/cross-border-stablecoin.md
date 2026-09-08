# Spec — international remittance with stablecoin, in two collection modes

**Status:** spec (planned). No code. Verified against the three repos on disk 2026-09-05/06, plus
`backend/docs/superpowers/specs/2026-08-25-crypto-acceptance-design.md`, ADR 0007 (payout
controls), ADR 0031 (Infi Managed), ADR 0033 (treasury ports) and ADR 0049 (no custody).
Providers are surveyed in `specs/cross-border-stablecoin-providers.md`. The change of posture this
spec needs is drafted as `backend/docs/decisions/0060-managed-stablecoin-settlement.md`.

**Product decision (2026-09-06, product owner):** cross-border runs in the two collection modes
Infi already has. In **`managed`**, the buyer pays into Infi's account at a licensed provider, the
provider converts and delivers to the merchant, in reais to their own bank account or in USDC to
their own wallet, and the merchant never opens an account anywhere. In **`byop`**, the merchant's
own provider account does the same and Infi connects a credential. Same checkout, same ledger,
same controls, one flag. **Addendum (2026-09-07): `managed` is the product and `byop` is hidden,
offered to enterprise accounts only.** P1 below (`byop` receive in USDC) therefore serves enterprise
and ships because MoonPay already exists; **P2 (`managed`) is the mainline** and is not waiting on P1.

**Why this matters more than the mechanics.** Infi's mission, as the product owner states it, is
that everyone should be an entrepreneur, diversifying their income globally. The unit of that
mission is a person, often a pessoa física, with no company, no PSP account and no crypto
knowledge, who has something a buyer in another country will pay for. `managed` exists so that
person is paid from abroad and receives in their own account having configured one screen. Every
scope cut in this spec is judged against that person first.

## The reframe: remittance is a direction, not a product

"Remessa internacional" for a merchant is money crossing a border in either direction, for a
handful of reasons. The merchant does not think of "selling abroad" and "paying a contractor
abroad" as different products; they think *the money has to get there*.

| | Movement | Merchant | Counterparty | Money goes | Reason |
|---|---|---|---|---|---|
| **R1** | **Receive** from abroad | Brazilian | A buyer or client outside Brazil | in, USDC or card | a USD product on the checkout; a B2B invoice a US client pays |
| **R2** | **Pay** abroad | Brazilian | A supplier, contractor, or SaaS outside Brazil | out, BRL → USDC or USD | a designer in Buenos Aires, a US vendor bill |
| **R3** | **Hold** abroad | Brazilian | The merchant's own foreign wallet | out, BRL → USDC | keep part of revenue in dollars |
| **R4** | **Reverse** | Outside Brazil | Brazilians | in by Pix / out by Pix | a US company selling to Brazil, or paying Brazilian contractors |
| **R0** | The rail | Anyone | An agent with a wallet | in, USDC | already shipped; a wallet has no country |

Two observations collapse the table. **R3 is R2 with the destination set to the merchant's own
wallet.** **R4-out is R2 with the roles swapped**, and R4-in is R1 swapped. So there are two
shapes: **receive**, the collection path Infi already runs, and **send**, the treasury payout path
Infi already runs. What is new in every row is a foreign destination and a party that converts.

The stablecoin makes the table cheap and changes nothing about who converts. USDC removes the
correspondent bank, the SWIFT fee, the foreign bank account and the three business days. It does
not remove the exchange. Someone turns reais into dollars, and that someone is an authorised
institution. **In `byop` it is the merchant's provider. In `managed` it is Infi's provider, on
Infi's account.** In neither mode is it Infi.

## The two modes, side by side

| | **`managed`** | **`byop`** |
|---|---|---|
| Who holds the account at the provider | Infi, with one **sub-account per tenant** | The merchant |
| Who the provider KYBs | Infi, and each tenant through Infi's dossier (ADR 0031) | The merchant |
| Where the buyer's USDC lands | A deposit address of the tenant's sub-account, **custodied by the provider** | The merchant's wallet, or the merchant's provider balance |
| Who converts | The provider, at confirmation, into the tenant's settlement currency | The merchant's provider, if the merchant asked it to |
| Where Infi's fee is taken | Netted on the sub-account at payout, `platform_fee` leg, as Managed Pix does | Off-rail, on Infi's platform invoice |
| How the merchant gets paid | Automatic payout to their own CPF/CNPJ Pix key or own wallet, on the rail's `settle_after` / `settle_at_amount` cadence | Already theirs |
| Who signs anything | Nobody at Infi. **Infi holds no key in either mode.** | Nobody at Infi |
| Who can use it | A live tenant with an approved managed dossier, PF or PJ, **billed in BRL** | Any live tenant |
| Where it is refused | Non-resident merchants (see R4); usage-priced products (as today) | Nowhere new |

What the merchant sees in `managed` is the sentence the product owner wrote: *the buyer paid, Infi
converted and sent it to my account.* What is true underneath is that a licensed provider did both
on an account Infi holds, and Infi orchestrated, recorded and took its fee. The gap between those
two sentences is the whole regulatory question, and it is stated once in "The regulatory frame"
and not re-litigated elsewhere.

## Design principles

- **Infi holds no key and is never a spender.** Invariants 1 and 2 of ADR 0009, universal, in both
  modes. `managed` custody is the provider's custody of a sub-account, never a wallet whose seed
  anyone at Infi has seen.
- **In `managed`, Infi's account is in the flow and Infi's fee is netted.** Invariant 3 of ADR
  0009 is crossed deliberately, for `managed` only, the way ADR 0031 already crosses ADR 0029 for
  Pix. ADR 0060 records it. `byop` keeps all four invariants.
- **Conversion happens once, at confirmation, by the provider, into the settlement currency.** The
  rate is stamped on the payment (`fx_rate`, `fx_source = provider`) exactly as platform billing
  stamps it. From that moment the tenant's balance is denominated in the settlement currency and
  every later movement is same-currency.
- **The ledger stays fiat, `CHAR(3)`, per currency, and balances per currency.** A USDC balance is
  denominated in USD on the ledger at the provider's rate, with the on-chain quantity as
  settlement detail. This needs one core change, named below, and its own ADR.
- **A remittance is a payout with a foreign destination, not a new domain.** `payouts` grows a
  destination and a purpose; the rule engine, the parked states, the backoffice approval and the
  ledger posting are the ones that exist.
- **Country and destination are declared, never inferred.** From the currency, the locale, or the
  provider. The checkout hardcodes `"BR"` today and that is the first thing to go.
- **Purpose and document travel with the order.** Not because Infi files anything, but because
  the provider will ask, and a remittance bounced for that on day three is worse than a 422.

## Verified facts (design constraints)

### Receive

| Fact | Where |
|---|---|
| The checkout **refuses a session without an 11 or 14 digit tax id**, and outside test mode the form toasts `taxIdRequired` before posting | `internal/checkout/session.go:126-127`; `frontend/.../checkout-payment-form.tsx:400-406` |
| The checkout hardcodes the payer's country as `"BR"` in both routing calls, and Pix is always the first option regardless of routing | `internal/checkout/handler.go:500,518,1016` |
| `cryptoEnabled` is `false` for any currency other than BRL, before routing is asked | `internal/checkout/handler.go:1009` |
| The MoonPay adapter rejects a non-BRL charge; the paylink is created with BRL as its **single** `pricingCurrency` | `provider/moonpay/moonpay.go:39`; `internal/moonpay/client.go:212,230` |
| The settlement detail column is literally `pricing_amount_brl`; `crypto_settlements` and `crypto_refund_evidence` reference `payments`/`refunds` only, no provider or method constraint | migration `000005` |
| `tenant_provider_crypto_configs.verification_status` already has `provider_managed`, `pending_provider_verification`, `operational` | migration `000005` |
| `routing.Catalog()` declares MoonPay `Currencies: BRL, Countries: BR`; **empty** `Countries` means "any"; `infi` is declared for pix and boleto only | `internal/routing/catalog.go:46-56,83-86`; `document.go:97` |
| The `infi` provider **delegates to the Asaas adapter** and is registered in live by name only, behind `PULSE_MANAGED_*` keys; routing names it because `collectionmode.Lister` answers `["infi"]` for a managed tenant; `collectionmode.Credentials` lets it through with no tenant credential | ADR 0030; ADR 0031 |
| Managed activation is a reviewed dossier: `managed_activations` with CNPJ and legal representative, documents in a private R2 bucket, `draft → pending_review → approved \| rejected`, approval in the backoffice | ADR 0031 |
| The managed branch has **no managed payouts, no card, no pricing** yet | branch `feat/managed-collection-mode`, unmerged |
| Managed Pix already nets Infi's fee: `platform_fee` debited against `psp_clearing` on confirmation | `internal/ledger/ledger.go:26-29` |
| KYC supports **both PF and PJ** (`entity_type IN ('pf','pj')`) | ADR 0037 |
| Stripe is declared for `BRL, USD, EUR, GBP`, passes `req.Currency` through, and is the only `SettlementRateReader` | `catalog.go:76`; `provider/stripe/stripe.go:127`; `provider/stripe/fx.go:26` |
| The platform meters a cross-currency payment at the provider rate and **fails loud, retrying forever, when no rate exists**; `fx_source` is `same_currency \| provider` | `internal/platformplan/consumer.go:230-246`; `internal/payment/fx.go:19-30`; migration `000008` |
| Billing currency: US → USD, everything else → BRL, frozen after first metered confirmation | `internal/platformplan/model.go:91-97`; migration `000007` |
| `customers.country` exists, feeds geo routing, is upserted with `COALESCE`, and **the checkout never writes it** | `genesis.up.sql:297`; `internal/payment/service.go:1009-1022`; `db/queries/customers.sql:1-10` |
| Email templates render any non-BRL amount as `USD 1.234,56`, pt-BR separators | `internal/notification/template/template.go:65-68` |
| `ledger.Poster` checks debits = credits **as one sum**, without separating currencies | `internal/ledger/ledger.go:66-80`; `initiatives/protected-payments/README.md` §10 |

### Send

| Fact | Where |
|---|---|
| `payouts.pix_key` is `NOT NULL`, `method` defaults `pix`, `currency` defaults `BRL`, and the service pins `currency := "BRL"` | `genesis.up.sql` `payouts`; `internal/treasury/service.go:365` |
| `CreatePayoutInput` is `{Amount, PixKey, KeyType, Description}` | `internal/treasury/service.go:311-316` |
| Money-out is one port, `PixPayer`; a read-only provider is excluded from the payout path **by type** | `internal/treasury/ports.go:283-287`; ADR 0033 |
| Seven payout rules with stable ids and fixed precedence, including `destination_ownership`: a CPF/CNPJ key must match the tenant's tax id; EMAIL/PHONE/EVP fall to `nonTaxKeyMode`, default **hold 24h** | `internal/treasury/rules/rules.go:16-63`; ADR 0007 |
| The destination blocklist is a SHA-256 fingerprint over `(keyType, canonical key)`, no PII | `internal/treasury/destination.go:14-36` |
| `provider_unknown` is parked, never auto-retried, released only by an audited `landed`/`not_landed` | `ports.go:44-70`; ADR 0007 |
| Parked payouts have no ledger postings; the posting is welded to provider acceptance in `executeTransfer` | ADR 0007 |
| Balance is one row per (provider, currency), never converted | ADR 0033; `service_currency_test.go` |
| The rail already batches settlement on `settle_after` / `settle_at_amount` per tenant | migration `000006` `rail_settings` |
| **Nothing in the three repos mentions remittance, wire, SWIFT, IBAN or a foreign supplier** | grep over `backend`, `frontend`, `infi-sdk`, `initiatives` |

Read together: Infi already has a two-phase, rule-gated, staff-approved money-out path that can
only send reais to a Pix key; a managed mode that already puts Infi's account in the flow for Pix
with a dossier, a fee leg and no payouts; and a crypto settlement schema built for "priced in
fiat, settled in USDC" with a provider-verified connection state. `managed` cross-border is those
three joined, plus one provider.

## The settlement provider, and what `infi` becomes

ADR 0030 modelled Infi's own account as a provider named `infi` that delegates to Asaas. For
cross-border, `infi` gains a second backend: **the settlement provider**, a Brazilian institution
authorised to custody virtual assets and to convert them (a PSAV with FX authorisation, or a bank
of exchange; see the providers survey). `infi` composes per method:

| Method | `infi` delegates to | Credential |
|---|---|---|
| pix, boleto | Asaas (today) | `PULSE_MANAGED_ASAAS_*` |
| **crypto** | **the settlement provider** | `PULSE_MANAGED_SETTLEMENT_*` |
| card | none yet (managed card is an open gap on the branch) | — |

`routing.Catalog()`'s `infi` entry gains `MethodCrypto`, `Currencies: BRL, USD`, no countries.
`collectionmode.Lister` and `collectionmode.Credentials` need no change: they already answer
`["infi"]` and let it through without a tenant credential. What is new is **the sub-account**:

- On managed approval, `infi` creates a **sub-account for the tenant** at the settlement provider
  and submits the dossier's identity data to the provider's KYC for that sub-account. The tenant's
  managed state is `pending_provider_verification` until the provider says `operational`, using
  the enum `tenant_provider_crypto_configs` already has. **The provider's approval is the gate.**
  Infi's review decides whether Infi wants the merchant; the provider's decides whether it may be
  paid.
- The tenant declares a **settlement preference**: `brl_pix` (the provider converts to BRL at
  confirmation; the balance is BRL) or `usdc_wallet` (no conversion; the balance is USDC,
  denominated USD). And a **settlement destination**: their own Pix key, or a wallet they prove
  control of by signing a message. Both are step-up gated, like `PUT /rail/settings/wallet`.
- Every crypto charge on a managed tenant is a **deposit address of that sub-account**, created
  per charge by the provider with an expiry, rendered in our page as MoonPay's widget is today.
  Infi never sees a key. Confirmation is the provider's webhook **plus readback on Infi's
  credential**, and the amount that confirms the invoice is the API's, never the body's.

## Receive (R1, R4-in)

### What both modes need first

Five things, four of them a literal.

1. **The tax id becomes conditional.** Required when the buyer declares Brazil or picks Pix or
   boleto. Optional otherwise. The rule lives in `session.go` where the check is.
2. **The contact step asks the buyer's country.** ISO-2, defaulting to the locale's country,
   stored on `checkout_sessions.country` (new) and copied to `customers.country` through the
   existing `COALESCE` upsert. The two hardcoded `"BR"` calls read it. Pix stops being
   unconditionally first.
3. **Three currency gates go.** `cryptoEnabled` asks routing with the invoice's currency; the
   MoonPay adapter accepts the currency its paylink was created for; `Catalog()` declares MoonPay
   `Currencies: BRL, USD` and no countries.
4. **One MoonPay paylink per pricing currency**, created lazily, validated by `PAYMENT_PRICING`.
5. **`pricing_amount_brl` → `pricing_amount` + `pricing_currency CHAR(3)`.**

Card in USD needs only items 1 and 2: Stripe already takes the currency and settles into BRL at a
rate `SettlementRate` reads. B2B receive is the same path through `GET /pay/{slug}/invoices/{id}`.

### R1 in `byop`

The merchant's MoonPay or Stripe, as today, with the gates above removed. USDC lands in their
wallet. Nothing converts, nothing is held. **The fee gap:** a Brazilian merchant billed in BRL
whose USD product settled in USDC has no fiat leg anyone converted, so D4 has no rate to read and
`consumer.go` refuses to meter the payment, loudly and forever. The correct failure, and it needs
a pricing decision:

> **Proposed D4′.** When the provider reports no rate into the billing currency, the platform fee
> is metered at the **Central Bank's PTAX closing rate for the confirmation date**, stamped once as
> `fx_source = 'ptax'` with the date in a new `fx_rate_ref`.

Until decided, a USD-priced crypto charge on a BRL-billed `byop` tenant is refused at routing with
a visible reason, and `byop` R1 ships card-only.

### R1 in `managed`

The buyer pays USDC to the tenant's sub-account deposit address. The provider confirms, and:

- **`brl_pix`:** the provider converts USDC → BRL at confirmation and reports the rate. The payment
  row is in the pricing currency; `crypto_settlements` records the USDC that arrived; a new
  `payment_conversions` row records `from_asset, from_amount, to_currency, to_amount, fx_rate,
  provider_fee, quote_id`, stamped once. If the product is priced in BRL, the ledger is BRL end to
  end and D4 is satisfied by the provider. If priced in USD, one cross-currency posting happens
  here (see "The ledger").
- **`usdc_wallet`:** nothing converts. The sub-account balance grows in USDC; the ledger
  denominates it in USD; `payment_conversions` still gets a row with `fx_source = 'par'` so that
  a later audit can see that "USD" here means "USDC at the provider's stated one-to-one", which
  the protected-payments initiative is right to call a claim rather than a fact.

Infi's fee is **netted at payout**, not at confirmation: a `platform_fee` leg against the tenant's
`psp_clearing` in the settlement currency, on the same posting as the payout, so a refund before
payout costs the merchant nothing in fees. Managed Pix nets at confirmation; the difference is
deliberate and stated because crypto refunds before payout are real and Pix ones are rare.

**Managed payout.** The tenant's sub-account balance is paid to their declared destination on the
rail's cadence, `settle_after` and `settle_at_amount`, defaulting to daily and to a floor that
covers the provider's fixed fee. Each payout runs through **the existing treasury path**: a payout
row, `Decide`, the seven rules, `executeTransfer`, the ledger posting welded to provider
acceptance. `destination_ownership` passes because the key is the tenant's own tax id; the
first-destination hold applies once. `brl_pix` uses `PixPayer` on `infi`'s settlement credential;
`usdc_wallet` uses the `RemittanceSender` port below with `destination.kind = wallet` and
`purpose = own_account`. This is the managed payout the branch lacks, built once for both rails.

**Refund in `managed`** is the provider returning the deposit to the payer's address from the
sub-account before payout, or from the tenant's balance after; a refund that exceeds the balance
is `manual_required` and the merchant tops up, because Infi advances nothing. No merchant-signed
evidence is needed: the provider executed it and reports the hash.

### R4-in stays `byop`

A foreign merchant paid by Pix and settled in USDC needs a Brazilian party receiving BRL from
Brazilian buyers and delivering USDC abroad. In `managed` that party's account holder is Infi,
which is Infi remitting for a non-resident: exactly the operation ADR 0049 says Infi does not
perform, whoever holds the licence underneath. Until counsel says otherwise, **`managed` is refused
for a tenant whose billing currency is not BRL**, in `collectionmode` beside `ErrSandbox`, before
the branch merges. R4-in ships as a `byop` provider: Pix in, USDC out to a named wallet, on the
merchant's own account, with refund in BRL to the payer's Pix key as a connect-time requirement,
and one sentence on the checkout saying whose name the buyer will see on the Pix.

## Send (R2, R3, R4-out): the remittance order

### The order

A remittance is a payout row. `payouts` grows a destination and a purpose; the Pix key becomes one
destination kind among three:

```jsonc
// POST /billing/payouts — today's body, plus:
{
  "amount": "1500.00",           // in the SOURCE currency: what leaves the balance
  "currency": "BRL",             // the balance's currency; the provider quotes the rest
  "destination": {
    "kind": "wallet",            // pix | wallet | bank_account
    "network": "eip155:8453",    // CAIP-2, wallet only
    "asset": "0x8335…2913",      // contract or mint, never a ticker
    "address": "0x…"
    // bank_account: { country, iban | routing+account, holderName }
  },
  "purpose": "services_import",  // closed enum
  "reference": { "kind": "bill", "id": "…" },
  "description": "Design, Sept"
}
```

**The amount is in the source currency and the provider quotes the rest.** The merchant orders
"send R$ 1.500 worth", the provider answers rate, fee, tax withheld and what will land, and the
merchant confirms that quote by id within its validity. Infi displays only a rate it was given,
labelled with who gave it. An order naming the *destination* amount is a guaranteed-receive
product, someone bearing rate risk, and is refused.

**Purpose is closed and required for a foreign destination**: `services_import`, `goods_import`,
`software_saas`, `own_account`, `contractor_payment`, `refund_to_payer`. **Reference is the
document**: a PDF in the private bucket `collectionmode` already uses, or an id of a bill Infi does
not model today. The provider receives it through its API; Infi stores an object key and a hash.

### The port

```go
// RemittanceSender: a Provider that can move a balance to a foreign destination,
// converting on the way. Held OFF Provider and OFF PixPayer, so a domestic-only
// provider cannot be constructed into a remittance candidate.
type RemittanceSender interface {
    Provider
    QuoteRemittance(ctx, cred, RemittanceQuoteRequest) (RemittanceQuote, error)
    CreateRemittance(ctx, cred, RemittanceRequest) (Remittance, error)
    ParseRemittanceWebhook(payload, headers) (RemittanceEvent, error)
}
```

**Both modes use it.** In `byop` the credential is the merchant's connection. In `managed` it is
`infi`'s settlement credential, addressed to the tenant's sub-account, resolved by the same
`collectionmode.Credentials` wrapper. `PixPayer` stays as it is; Asaas, Efí and Woovi never
implement `RemittanceSender`.

### The controls

All seven rules apply unchanged. Three things change: `DestinationFingerprint` takes the
destination kind so a wallet and a Pix EVP with the same bytes are distinct; ownership is
`unverifiable` for every foreign destination except `own_account`, where the wallet must be one
the tenant proved control of; and two rules are new, `payout.destination_kind_allowlist`
(shipping `enforce` with wallet on Base and Solana USDC) and `payout.purpose_required`. Limits are
compared in the source currency, so the BRL `decimal` facts still hold and the crypto design's
"USDC against BRL limits" problem is avoided rather than solved.

### The record

`payout_settlements`, one row per payout: `quote_id, source_amount, source_currency, fx_rate,
provider_fee, tax_withheld, deliver_asset, deliver_network, deliver_amount NUMERIC(38,18),
transaction_ref, provider_status, reconciliation_status`. Reconciled against the wallet observer
that already exists; a divergence is `needs_review`, never a ledger adjustment.

### R3 and R4-out

**R3 is a payout to yourself**, `purpose: own_account`, to a proven wallet. In `managed` with
`usdc_wallet` it is the *default* payout, not a feature. A recurring "30% every Friday" is a
scheduled payout and is deferred: the rule engine has no time dimension.

**R4-out is the mirror**: a US tenant paying a contractor in Recife by Pix, `destination.kind =
pix`, source currency not BRL, on a `byop` provider whose direction is crypto-in, fiat-out.
`destination_ownership` must not read the payee's CPF as "the tenant's own tax id" for a
non-resident tenant.

## The ledger: one core change, and why it cannot be avoided

`ledger.Poster` sums debits and credits across all postings without separating currencies. A
managed sale priced in USD and settled in BRL, or priced in BRL and held in USDC, is a
**cross-currency movement**, and a single transaction with a USD leg and a BRL leg either fails
the balance check or, worse, passes it by coincidence of amounts.

The change: **the Poster balances per currency**, refusing a transaction whose legs do not net to
zero within each currency it touches. A conversion is then **two single-currency transactions**
joined by the `payment_conversions` (or `payout_settlements`) row that carries the rate:

```
USD:  debit psp_clearing 100.00     credit fx_conversion 100.00
BRL:  debit fx_conversion 540.00    credit psp_clearing 540.00      (rate 5.40, provider)
```

`fx_conversion` is a new per-tenant, per-currency account kind that nets to the provider's spread
over time and is what reconciliation reads. Nothing is ever posted in `USDC`: the USD side is the
provider's stated value of the USDC held, and the on-chain quantity lives in settlement detail.
This is the change `initiatives/protected-payments/README.md` §10 says needs its own ADR, and it
does; ADR 0060 names it and a following ADR decides it. Everything in `byop` and everything in
`managed` with `brl_pix` on a BRL-priced product works without it, which is why P2 is ordered the
way it is.

## R0 — the rail, and the vocabulary to reuse

Nothing to build. Networks are CAIP-2 (`eip155:8453`, not `base`); `000005`'s `settlement_network
IN ('base','solana')` predates that and no new table repeats it. Which networks and assets move
real money is compiled, not stored. Settlement cadence is `settle_after` / `settle_at_amount`, and
managed payout borrows the names.

## The regulatory frame, stated once

Constraints on the design, for counsel to confirm before P2 signs a contract.

- **The party that custodies, converts and moves is the licensed party.** A PSAV authorised to
  operate in FX under Resolutions 519–521 (in force 2026-02-02), or a bank of exchange under Lei
  14.286/2021. In `byop` it is the merchant's; in `managed` it is Infi's provider, on an account
  Infi holds. Infi holds no licence and no key.
- **Since April 2026 the set of such parties is narrower, and contested.** Resolution BCB 561 (in
  force 2026-10-01) forbids an eFX provider from settling with its foreign counterparty in virtual
  assets. One reading leaves PSAVs under 521 free to settle cross-border in stablecoins; another
  reads it as closing crypto settlement for every regulated remittance institution. Every vendor
  states in writing under which authorisation its USDC leg runs after that date.
- **`managed` puts Infi's account in the flow.** That is already true for Pix under ADR 0031, and
  counsel has not yet said whether being the account holder at a PSAV, with sub-accounts per
  merchant, makes Infi a PSAV itself. This is the question ADR 0006 left open for sub-acquiring,
  now with a virtual asset in it. **P2 does not go live before it is answered**; P2's data model,
  port and rules do not wait for it.
- **The merchant is the party to the exchange.** In `managed`, the tenant sells USDC to the
  provider for BRL, or receives USDC; the tax event is theirs, the documentation is theirs, and
  the dossier is what lets the provider know who they are. A PF merchant is a person selling
  abroad and receiving in their own account, which ADR 0037 already admits.
- **A reference rate for Infi's own fee is not a conversion.** D4′ computes a BRL fee on Infi's own
  invoice; it moves nothing.

## Phasing

**P0 — the buyer can be foreign.** Country on the contact step, tax id conditional, the two `"BR"`
literals, Pix no longer forced first, receipt email by locale. *At the end:* a Brazilian merchant
with a USD product sells it by card, through their own Stripe, to a buyer with no CPF.

**P1 — `byop` receive in USDC.** The three currency gates, the paylink per currency, the column
rename, D4′. MoonPay exists. *At the end:* R1 holds in `byop` with a real buyer on Base mainnet.

**P2 — `managed` receive and managed payout.** The settlement provider behind `infi` for
`crypto`; the sub-account on managed approval with the provider's KYC as the gate; settlement
preference and destination, step-up gated; deposit address per charge; `payment_conversions`;
managed payout through the treasury path with `brl_pix` on `PixPayer` and `usdc_wallet` on
`RemittanceSender`; fee netted at payout; refund from the sub-account. **Scoped to BRL-priced
products first**, so no cross-currency posting is needed and the ledger change can land in its own
PR under its own ADR. *At the end:* a PF merchant with no account anywhere sells a BRL-priced
workshop to a buyer in Lisbon who pays USDC, and receives reais in their own account the next
morning, or USDC in their own wallet, having configured one screen.

**P3 — the remittance order, both modes.** `destination` and `purpose` on the payout, the two new
rules, the fingerprint change, `payout_settlements`, quote-then-confirm in the dashboard.
`managed` sends from the sub-account; `byop` from the merchant's provider. *At the end:* R2 and R3
hold with every ADR 0007 control in the way.

**P4 — USD-priced managed sales, and reverse.** The per-currency Poster and `fx_conversion`; then
R4 as `byop` providers. *At the end:* the whole table.

P2 before P3 because P2 is the product decision and it reuses the most. P2 scoped to BRL pricing
because that is the merchant the product owner described, and because it keeps the ledger change
out of the critical path.

## Verification

- A buyer declaring `PT` with no tax id creates a session; declaring `BR` is refused with today's
  message; `BR` with a CPF choosing card is accepted. Same three on `GET /pay/{slug}/invoices/{id}`.
- A USD invoice on a BR merchant with Stripe connected offers card and not Pix or boleto.
- `customers.country` written by a checkout never overwrites a non-null value.
- `byop`, MoonPay, USD product: `cryptoEnabled: true`; USD paylink reused; `pricing_currency =
  'USD'`; USD `receivable`/`revenue` pair; no ledger row in any currency named `USDC`.
- `managed`, approved dossier, provider says `pending_provider_verification`: the tenant cannot
  take a crypto charge; the dashboard says why. Provider says `operational`: it can.
- `managed`, BRL product, `brl_pix`: a USDC payment confirms only after readback; a webhook body
  with a different amount confirms nothing and lands in `needs_review`; `payment_conversions` has
  the provider's rate; the ledger is BRL only; the payout row appears on the cadence, passes
  `destination_ownership` on the tenant's own CPF, holds once as a new destination, and posts
  `platform_fee` on the same transaction as the payout.
- `managed`, `usdc_wallet`, destination wallet not proven by signature: refused at settings, not
  at payout.
- A refund before payout returns the deposit and posts no fee; a refund exceeding the balance is
  `manual_required` and no ledger leg moves.
- A tenant with `billing_currency = 'USD'` cannot switch to `managed`.
- A remittance above the approval threshold to a new wallet parks in `pending_approval`; to a
  blocked wallet, `destination_blocked` regardless of casing; timed out, `provider_unknown` with
  no posting, resolved `landed` posts once.
- `payout_settlements.fx_rate` equals the confirmed quote's rate and never changes.
- A cross-currency posting whose legs do not net within each currency is refused by the Poster,
  and a test enumerates a USD/BRL pair that would pass the old single-sum check by coincidence.
- Balance shows one row per (provider, currency) plus one per wallet, and no total.

Sandbox on Base Sepolia or Solana devnet for all of it; P1's and P2's last checks run once on
mainnet with a real one-dollar movement before anyone calls them done.

## Non-goals

**Infi holding a key, being a spender, or holding a licence.** In either mode. `managed` custody is
the provider's.

**Own-licence Infi (a PSAV or bank of exchange).** The declared future of ADR 0006, not this spec.

**`managed` for a non-resident merchant.** Refused structurally until counsel says otherwise.

**A USDC unit in the ledger.** The ledger denominates in fiat at the provider's stated value; the
protected-payments asset ledger is a different product with a reason to owe USDC.

**A consumer remittance app**, guaranteed-receive amounts, hedging, scheduled or percentage
remittances, import and export paperwork, multi-currency products, EUR and GBP as promised
currencies, stablecoins other than USDC, networks other than Base and Solana, auto-charged crypto
subscriptions, buying USDC for a buyer. Each decided elsewhere and unchanged.

## Open questions

1. **Counsel, question 1:** does being the account holder at a PSAV with sub-accounts per
   merchant make Infi a PSAV? Blocks P2 going live, not P2 being built.
2. **Counsel, question 2:** which reading of Resolution 561 holds, and does the chosen provider's
   authorisation survive it on 2026-10-01?
3. **Which settlement provider behind `infi`?** Surveyed in the providers file; shortlist Avenia,
   Bitso Business, Braza. The questionnaire there is now weighted toward sub-accounts with
   per-sub-account KYC, deposit addresses per charge, conversion at confirmation with a reported
   rate, and Pix payout from the sub-account.
4. **D4′.** Only `byop` needs it now. Does the product owner accept PTAX for the fee when no
   provider rate exists?
5. **Fee at payout or at confirmation in `managed`?** This spec says payout, for the refund
   reason. Managed Pix says confirmation. One of the two should give.
6. **Does `managed` admit a pessoa física at all?** The Managed go-live track (2026-09-06) sets
   eligibility as "empresa sediada no Brasil com CNPJ", and ADR 0031's dossier is CNPJ-shaped. The
   mission and the merchant described for this spec are a PF. Either Managed admits CPF generally,
   with a PF dossier (CPF, birth date, address, a document; the provider's sub-account KYC sets the
   minimum, and ADR 0037 already admits PF), or only the crypto settlement arm does. This is a
   product decision that the Managed track and this spec have to take together, not separately.
7. **Does the merchant see the destination amount before confirming a remittance?** Yes, from the
   quote, expiry visible; a quote that expires in `held` is confirmed again, not re-quoted silently.
8. **Is the buyer's country a session fact or a customer fact?** Session, copied with `COALESCE`.
9. **What does a Brazilian buyer of a foreign merchant hold as a fiscal document?** No code answers it.
