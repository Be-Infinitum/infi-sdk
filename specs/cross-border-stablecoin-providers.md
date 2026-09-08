# Providers — who can run the licensed leg of `cross-border-stablecoin.md`

**Status:** survey, read from public pages on 2026-09-06. Nothing here is a contract, a price, or a
legal opinion. Companion to `specs/cross-border-stablecoin.md`, and the answer to its open
question 3. Confidence labels as in the crypto design: **[D]** read on the provider's or
regulator's own page; **[P]** press or a third party; **[U]** not found, needs a call.

## Read this first: the rules moved twice this year, and the second time matters more

The spec says Infi never converts and the merchant's provider does. Who is *allowed* to be that
provider changed in 2026, and it decides the shortlist before any API is compared.

**Resolutions BCB 519, 520 and 521 (published 2025-11-10, in force 2026-02-02).** Virtual-asset
service providers (PSAV/SPSAV) enter the Central Bank's perimeter. Resolution 521 puts four
operations **inside the foreign-exchange market**: international payment or transfer using
virtual assets; transfers to or from a self-custody wallet; buying, selling or swapping
stablecoins; and virtual-asset transfers settling international card use. A PSAV may perform
them only if authorised to operate in FX, and an international transfer with virtual assets is
capped at **US$ 100,000 per operation when the counterparty is not an authorised institution**.
Operators already running on 2026-02-02 must file by **2026-10-30**; after that date an authorised
institution may not intermediate for a PSAV that is neither authorised nor in process. [D: Mattos
Filho, Machado Meyer, Lefosse summaries; BCB presentation]

**Resolution BCB 561 (published 2026-04-30, in force 2026-10-01).** Amends the eFX rules (Res.
277). An eFX provider **may not use virtual assets to pay or receive against its counterparty
abroad**; settlement with the foreign counterparty must be a classic FX operation or a movement
on a non-resident's BRL account in Brazil. eFX is restricted to BCB-authorised institutions;
unauthorised providers have until **2027-05-31** to apply. It also opens eFX to investment
transfers up to US$ 10,000. [D: Migalhas, Merc Group, Finsiders]

**The two readings, and why it is counsel's question 1.** Sources disagree on breadth. Migalhas
(quoting the lawyer Thiago Amaral), Codex and Barcellos Tucunduva read 561 as eFX-only:
*"licensed virtual-asset service providers under Resolution 521 can still use stablecoins for
cross-border payments."* Bitnoticias and CoinDesk read it as barring banks, FX brokers and
fintechs in the regulated remittance market from crypto settlement altogether. The difference
is the whole of R2, R3 and R4 in the spec. **Every vendor below must state in writing under which
authorisation its USDC leg is executed on and after 2026-10-01**, and counsel must agree with the
answer before P2 signs.

**Consequence already visible in the market.** BlindPay writes that *"offshore providers without
a Brazilian entity are exiting or restructuring"* and that jurisdiction follows the customer,
not the server. [D] A provider whose Pix leg is "a partner bank" with no named Brazilian entity
of its own is a vendor risk the spec should not carry.

## Two account models, because the spec has two modes

The spec (2026-09-06) runs cross-border in Infi's two collection modes, and each wants the
opposite thing from a provider.

**`managed` wants the platform model.** Infi is the account holder, each merchant is a
**sub-account with its own KYC**, deposit addresses are created per charge on the sub-account,
the provider custodies and converts, and payouts go from the sub-account to the merchant's own
Pix key or wallet. This is the shape most stablecoin APIs are built for by default: Avenia's
sub-accounts with `subAccountId` KYC, Bridge's developer-plus-KYC'd-customers, Trace's accounts,
Conduit's managed wallets. What was a fit problem for a BYOP-only spec is now the requirement,
with two conditions that stay: **Infi never holds a key** (the provider custodies, or it is not a
candidate), and counsel must say whether being the account holder makes Infi a PSAV.

**`byop` wants the merchant model.** The merchant opens the account, passes the provider's KYB,
and hands Infi a credential scoped to that account, as with Asaas and Stripe today. Self-serve
business accounts with API keys (Bitso Business, MoonPay Commerce, Stripe) fit; institutional
onboarding (Foxbit Infra, Braza enterprise) fits a fintech, not a PME.

A provider that offers **both**, a platform account with sub-accounts *and* self-serve accounts a
merchant can open alone, serves both modes with one adapter. Recorded per vendor below as
*account model*.

## Capability map

What the spec needs, in the spec's own names. R1 is receive in USDC (Brazilian merchant, foreign
buyer). R2/R3 is send: BRL out, USDC or fiat delivered abroad, including to the merchant's own
wallet. R4-in is Pix in, USDC out, for a foreign merchant. R4-out is USDC in, Pix out, to a
Brazilian payee.

| Provider | Brazilian entity and licence | R1 | R2 / R3 | R4-in | R4-out | Account model | Docs and sandbox |
|---|---|---|---|---|---|---|---|
| **Avenia** (ex BRLA Digital) | Issuer of BRLA; licence category **[U]**, not stated on site or docs | — | BRL Pix → USDC/USDT/EURC/BRLA; SWIFT payouts in 16 currencies **with mandatory invoice upload** [D] | Pix → USDC [D] | USDC → Pix by key, account or full details [D] | Accounts and sub-accounts with KYC per sub-account; merchant-owned account **[U]** | Public API guide, quotes valid 15 s with `basePrice` + itemised `appliedFees`, refund of unconverted Pix deposits, webhooks, sandbox [D] |
| **Bitso Business** | **Nvio Brasil authorised as instituição de pagamento** (e-money issuer) [P]; PSAV status **[U]** | — | Pix in → USDC out at wholesale rates [D blog] | Pix → USDC [D blog] | USDC → Pix [D blog] | Self-serve business account with API keys and one-click sandbox [D]; per-merchant accounts plausible **[U]** | Docs portal [D]; **USDC only on Ethereum and Solana, no Base** [D help center] |
| **Braza Bank / BBRL** | **Banco de câmbio**, i.e. an FX-authorised bank [P]; BBRL on Polygon and BNB Chain [P] | — | Enterprise batch payments, BRL ↔ USD/EUR onchain FX with Conduit [P] | via Conduit **[U]** | **[U]** | Enterprise; API for a PME merchant **[U]** | **[U]** |
| **Transfero** | Issuer of BRZ since 2019; regulatory category not disclosed on site **[U]** | — | Pix and local accounts in, global payouts out; USDC/USDT/EURC/BRZ; Fireblocks custody [D] | [D, generic] | [D, generic] | B2B for PSPs, fintechs, exchanges [D]; per-merchant **[U]** | Docs not public **[U]** |
| **Foxbit Infra** | **SPSAV authorisation in process** [D]; Law 14.478 and Res. 519–521 cited | — | Pix ↔ stablecoin, BRL ↔ stablecoin ↔ USD routing [D] | [D] | [D] | Institutional: banks, PicPay, 99Pay, brokers [D]; a PME merchant as account holder **[U]** | **[U]** |
| **Trace Finance** | Brazilian; *"banking correspondent in partnership with institutions authorised by the BCB"* [D], so **not itself the licensed party** | — | Pix deposit → USDC/USDT in under a minute; withdrawals to banks and wallets; FX quotes [D] | [D] | [D] | Accounts holding fiat and crypto; per-merchant **[U]** | Public docs, sandbox, webhooks [D] |
| **Bridge (Stripe)** | Brazilian licence held via partner; **"Pix endorsement" required** [D]; entity **[U]** | — | BRL virtual account (Pix payin from 1st and 3rd parties) → stablecoin; liquidation addresses → Pix; 5–30 min; US$ 500k/month before enhanced KYC [D] | **Brazilian businesses may use on and off ramps** [D] | [D] | **Developer is the account holder**, merchants are KYC'd customers under Bridge's developer agreement [D] | Public API docs [D]; supports BRLA [D] |
| **Stripe (own products)** | US-only for stablecoin acceptance [D, crypto design §11.1] | For a **US** merchant only: stablecoin acceptance at 1.5%, USDC on Solana/Ethereum/Polygon [P] | Treasury: offramp USDC/EURC to BRL bank accounts (Q2 2026 preview), fund from BRL (Q3 preview) [D Sessions 2026] | **US businesses accept Pix via Link** (2026-04-29); settlement currency not stated [D] | Global Payouts in stablecoins to 160 countries, fiat to 100+ [D] | Merchant's own Stripe account: **already BYOP in Infi** | Already integrated |
| **BlindPay** | **Own SPSAV entity under the art. 88 transitional regime** [D] | — | Pix in, stablecoin out; quotes lock 5 min; auto-refund on failure [D] | [D] | [D] | Platform + KYC'd customers [D]; per-merchant **[U]** | Docs host unreachable during survey **[U]** |
| **Conduit** | Via partners, Braza among them [P]; Brazil KYB guide exists [D] | — | Payouts from a **Conduit-managed wallet** [D]; quotes [D] | [P] | [P] | Custodial for the developer by design [D] | Public docs [D] |
| **Circle Mint** | Circle; Pix into Mint for **KYB'd businesses, 2–8 weeks**, aimed at scale distributors [P] | — | BRL → USDC mint at Circle's rate [D]; large merchants only | — | — | The merchant's own Mint account, if accepted | Not an embedded product |
| **MoonPay Commerce** (current) | Merchant's own account; MoonPay owns KYB [D, migration 000005] | **Already live**, BRL-priced; USD pricing depends on `PAYMENT_PRICING` flags, checked by one API call **[U]** | — | — | — | BYOP, already | Offramp USD/EUR only; BRL "coming soon" for Enterprise [D help center] |

Kept on the list, not evaluated: **UnblockPay** (Pix, SEPA, wire, 150+ countries; docs shallow),
**Azify** (Brazilian cross-border via stablecoins "without the client touching crypto"), **Codex
FX** (BRL via Pix, locked rates, institutional), **TransFi** (USDT collection and payout in
Brazil), **Iron** and **MuralPay** (US senders paying LatAm contractors; the wrong direction for
R2, a candidate for R4-out), **Ramp Network** (Pix as a payout rail), **PagCrypto** (crypto in,
BRL out; the crypto design's Tier 1). None was found to name a Brazilian licence on its public
pages.

**Fiat remittance, for the record.** The spec's `RemittanceSender` port is asset-agnostic
(`deliver_asset` is USDC or a `CHAR(3)`), so a provider that sends dollars by wire is a valid
implementation of R2 with no stablecoin at all. **Remessa Online / EBANX** offers an FX API for
partners embedding remittance [P; page refused the fetch]; **Husky (Nomad)** receives from abroad
into a Brazilian account [P]; **Wise Platform** exists. They matter because a merchant paying a US
vendor does not care which rail carried it, and because after 2026-10-01 a classic FX operation
is the one settlement path no reading of Resolution 561 restricts.

## Recommendation

**P1 (R1, receive in USDC): stay on MoonPay Commerce.** It is integrated, BYOP, and non-custodial.
The only thing to learn is whether USD is a pricing currency on the merchant's paylink, and the
spec already says how (one call to `GET /v1/currency/all`). If USD is absent, R1 ships card-only
via the merchant's Stripe and waits, which is not a bad place to wait.

**P2 (`managed` receive and payout) and P3 (send): one settlement provider behind `infi`, chosen
from three, in this order.**

1. **Avenia.** Sub-accounts with per-sub-account KYC, Pix and USDC in and out, quotes with
   itemised fees and a validity, confirm by id, invoice upload on international payouts, refund
   of unconverted deposits, webhooks, sandbox, Base among the chains. It is the `managed` shape
   almost line for line. The unknown that matters is its licence category, and whether the
   sub-account's USDC is custodied by Avenia (required) or by a third party.
2. **Bitso Business.** The only candidate with a **named, authorised Brazilian payment institution**
   on public record, plus self-serve accounts, which also serves `byop`. Two costs: USDC on
   Ethereum and Solana, not Base, so `managed` settles on Solana or waits for Base; and PSAV status
   after 2026-10-30 is unconfirmed. Ask whether sub-accounts exist.
3. **Braza Bank**, directly or through Conduit. Unambiguously an FX-authorised institution, the
   safest ground under either reading of Resolution 561. Everything about a platform account with
   sub-accounts is [U], so it is the licence-safe option to qualify in parallel.

Bridge is the platform model exactly, supports BRLA, and lets Brazilian businesses use on and off
ramps; its Brazilian licence is via an unnamed partner and the developer agreement makes Infi the
customer of record, so counsel's answer decides it, not the API. Transfero and Foxbit Infra are
credible and institutional; ask, but second. For `byop` alone, MoonPay Commerce stays.

**P3 (R4, reverse): Stripe first, then Avenia or BlindPay.** A US merchant on Infi already has a
Stripe account connected. Stripe now lets US businesses accept Pix and pays out in stablecoins,
so R4-in and R4-out may be a Stripe-adapter change rather than a new provider, if Pix via Link is
reachable through the API and not only through Link's hosted flow. Avenia already serves foreign
platforms into Pix; BlindPay has its own SPSAV entity. Bridge is the same infrastructure as
Stripe's, one layer down, with the account-model problem above.

**Refused for the spec's purposes.** Any provider that would hand Infi a key, a signer or an MPC
share for the platform account: `managed` custody is the provider's, or it is not `managed`. Any
provider whose Brazilian licence is "a partner" it will not name. And, for `byop`, any provider
that cannot let a merchant open an account alone.

## The questionnaire

Twelve questions, to be answered in writing by every vendor before an adapter is designed. The
first two decide whether the conversation continues.

1. Under **which BCB authorisation** (PSAV with FX authorisation, banco de câmbio, corretora,
   instituição de pagamento with an FX partner) does your USDC leg execute **on and after
   2026-10-01**, and what is the CNPJ of the entity that holds it?
2. For `managed`: can Infi hold a **platform account with one sub-account per merchant**, each
   with its own KYC (PF and PJ), its own deposit addresses per charge, its own balance, and a
   payout from the sub-account to that merchant's own Pix key or wallet, with **custody entirely
   yours and no key ever issued to us**? For `byop`: can a merchant open an account alone and hand
   us an API credential scoped to it?
2b. Who is the **account holder of record** for the sub-account's funds under your terms, Infi or
   the merchant, and have you had counsel opine on whether a platform holding sub-accounts is
   itself a PSAV?
3. Do you **quote before executing**, with a validity window, and does the quote itemise rate,
   your fee, network fee and tax withheld?
4. On completion, do you report the **executed rate**, fees and tax on the transfer object, and are
   they immutable afterwards?
5. Do you accept a **purpose (natureza) and a supporting document** through the API, and which
   purposes do you support for a company paying a foreign supplier, a contractor, a SaaS vendor,
   and itself?
6. Which **networks and assets** do you deliver to: USDC on Base, on Solana, others; and do you
   read `decimals` from the token or assume six?
7. What is the **per-operation and monthly limit**, and which document tier raises it?
8. Do you **refund**: unconverted deposits, failed payouts, and, for Pix-in flows, BRL back to the
   payer's Pix key funded from the merchant's balance?
9. How is an **inbound webhook authenticated**, and can every event be read back by API on the
   merchant's credential (the spec confirms nothing from a body alone)?
10. What happens on a **timeout**: is the transfer idempotent on our reference, and can we query
    its disposition later without guessing?
11. Do you offer a **sandbox** that exercises Pix and a testnet (Base Sepolia or Solana devnet), or
    only mocked responses?
12. Which **wallets on the merchant's account** can you list, so `own_account` remittances can be
    restricted to them?

## Sources

Regulation: [Mattos Filho on 519/520/521](https://www.mattosfilho.com.br/unico/normas-regulamentacao-ativos-virtuais/),
[Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/bancario-seguros-e-financeiro-ij/bcb-regulamenta-o-mercado-de-ativos-virtuais-no-brasil),
[Lefosse](https://lefosse.com/noticias/alerta/banco-central-regulamenta-o-uso-de-ativos-virtuais-e-o-funcionamento-das-prestadoras-de-servicos-de-ativos-virtuais/),
[BCB presentation, Nov 2025](https://www.bcb.gov.br/conteudo/home-ptbr/TextosApresentacoes/AVs_mercado_cambio_%20e_capitais_coletiva1_10.11.25.pdf),
[Migalhas on 561](https://www.migalhas.com.br/quentes/455149/advogado-avalia-norma-do-bc-que-nao-proibe-stablecoins-mas-limita-efx),
[Merc Group on 561](https://www.mercgroup.com.br/insights/bcb-561-efx-investimentos-exterior-vigencia-outubro),
[Finsiders on 561](https://finsidersbrasil.com.br/regulamentacao/resolucao-bcb-561-efx-stablecoins-pagamentos-internacionais/),
[Bitnoticias](https://bitnoticias.com.br/regulacao/banco-central-veta-cripto-pagamentos-internacionais-outubro/),
[CoinDesk](https://www.coindesk.com/policy/2026/05/02/brazil-s-central-bank-bans-stablecoin-and-crypto-settlement-in-cross-border-payments),
[Codex on Brazil](https://codex.xyz/blogs/stablecoin-payments-in-brazil-cross-border-fx-settlement-and-on-ramp-infrastructure),
[BlindPay on PSAV](https://blindpay.com/resources/more/psav-brazil-explained).

Providers: [Avenia](https://avenia.io/) and [API combinations](https://integration-guide.avenia.io/docs/Operations/combinations/),
[Bitso Business](https://business.bitso.com/en/blog/stablecoin-liquidity-via-pix-spei-in-brazil-mexico), [Bitso USDC networks](https://support.bitso.com/hc/en-us/articles/6844360027924-USD-Coin-USDC), [Nvio Brasil authorisation](https://finsidersbrasil.com.br/noticias-sobre-fintechs/instituicao-de-pagamento-da-bitso-recebe-aval-do-bc-para-operar/),
[Braza BBRL](https://www.brazabank.com.br/bbrl/), [Conduit + Braza](https://conduitpay.com/blog/conduit-partners-with-braza-group-to-enable-real-time-onchain-fx),
[Transfero cross-border](https://transfero.com/solutions/cross-border-payments),
[Foxbit Infra licences](https://infra.foxbit.com.br/regulacao-e-licencas/),
[Trace](https://www.tracefinance.com/) and [docs](https://tracefinance.mintlify.app/),
[Bridge BRL guide](https://apidocs.bridge.xyz/get-started/guides/move-money/brl_pix_integration_guide),
[Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026),
[BlindPay](https://blindpay.com/), [Conduit docs](https://docs.conduit.financial/),
[Circle Mint local currencies](https://www.circle.com/blog/circle-mint-expands-to-8-local-currency-on-offramps), [Circle in Brazil](https://www.circle.com/blog/usdc-now-available-in-brazil-and-mexico-through-national-payment-systems-with-local-currency),
[MoonPay Commerce FAQ](https://support.moonpay.com/en/articles/466267-moonpay-commerce-faqs), [Helio currency list](https://docs.hel.io/reference/currency/list.md),
[Remessa Online FX API](https://www.remessaonline.com.br/apis-cambio), [Husky](https://www.husky.io/).
