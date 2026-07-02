# Example apps — market-sourced idea catalog

Goal: build a handful of small, *recognizable* apps that make a dev/founder/CEO think
"wait — billing + auth + metering was **that** easy?". Ideas below are drawn from what
the market is actually building and paying for in 2025–2026, then mapped to the beinfi
primitive they show off.

## What the market is doing (research)

- **Credit-based pricing is the default for generative-AI apps** — issue credits, spend
  them on each generation. Most-common AI monetization today. ([Schematic](https://schematichq.com/blog/best-usage-based-billing-software-for-startups), [Lago](https://getlago.com/blog/usage-based-pricing-examples))
- **Usage / metered APIs** are the canonical dev-tool model — bill by API call, token,
  message, minute, or compute. Twilio (per SMS), Mistral (per token), AWS (per GB/hr),
  Snowflake (compute credits). ([Lago](https://getlago.com/blog/usage-based-pricing-examples))
- **Hybrid = subscription floor + usage ceiling** is where AI-era SaaS converges:
  predictable ARR + expansion when customers grow. ([Schematic](https://schematichq.com/blog/usage-billing-software))
- **Vertical micro-SaaS** is the hot founder niche: one industry, subscription + built-in
  payment collection (booking + deposits for tattoo artists / therapists / tutors;
  landlord tenant portals; niche invoicing). Solo founders at $5–50k MRR. ([ideaproof](https://ideaproof.io/lists/micro-saas-ideas), [entrepreneurloop](https://entrepreneurloop.com/bootstrapped-saas-niches-solo-founders/))
- **GPT-wrapper apps** monetize at $19–$299/mo (subscriptions) or per-generation credits;
  proven demand (a "custom ChatGPT on your data" hit ~$64k MRR). ([gptwrapperapps](https://www.gptwrapperapps.com/blog/10-profitable-gpt-wrapper-ideas), [scalacode](https://www.scalacode.com/blog/ai-app-ideas/))
- **Outcome-based billing** is emerging: Intercom Fin (per AI-resolved ticket),
  Chargeflow (% of recovered chargebacks). ([Lago](https://getlago.com/blog/usage-based-pricing-examples))

Reference: Stripe and Polar both ship exactly these as sample apps (subscription,
usage-based, checkout). Our examples should read as the beinfi equivalents — but shorter.
([Stripe samples](https://github.com/stripe-samples), [Polar](https://polar.sh/))

## Idea catalog (by billing model → persona → the "aha")

### A. Prepaid **credits** (AI apps) — persona: indie dev / GPT-wrapper builder
- **AI Content Studio** — LinkedIn posts / product descriptions / cold emails; 1 credit per
  generation. (Top GPT-wrapper niche, $19–$299/mo equivalents.)
- **AI Chat / Agent** — credits (or tokens) per message.
- **AI Image / OG-image / thumbnail generator** — credits per render.
- **Meeting-notes / transcription** — credits per minute.
- *aha:* buy credits, spend on use, out-of-credit banner → top-up — all without the dev
  writing a ledger, a checkout, or a paywall.

### B. Pay-as-you-go **usage / metered API** — persona: API-first startup / CEO wanting usage revenue
- **Screenshot / OG-image API**, **SMS/notification API** (Twilio-style), **data-enrichment
  API** (per record), **transcription API** (per minute). Each request → one metered event;
  month-end invoice.
- *aha:* meter every call with one line, get an automatic monthly invoice + payment link +
  `invoice.paid` webhook. The thing companies normally hire a billing team to build.

### C. **Subscription / tiered** (Free/Pro) — persona: non-technical founder / vertical SaaS
- **Vertical booking + deposits** (tattoo artists, therapists, tutors, groomers) — pro pays a
  subscription; clients pay deposits at checkout.
- **Niche invoicing / creator tool / link-in-bio** with Free vs Pro gating.
- **Landlord tenant portal** (5–20 units) — subscription + rent collection.
- *aha:* plans, upgrade checkout, and "gate this feature behind Pro" as a guard — no billing
  plumbing, no Stripe dashboard wrangling.

### D. **Hybrid** (subscription + usage overage) — persona: growth-stage SaaS / CEO
- **Analytics / observability** (base plan + overage on events), **support desk** (base +
  per-resolution). Shows floor-plus-ceiling on one invoice.

## Recommended trio to build first (max coverage, most recognizable)

| # | App | Billing model | Persona it wows | beinfi features shown |
| --- | --- | --- | --- | --- |
| 1 | **AI credits app** (chat or content studio) | prepaid credits | indie dev / GPT-wrapper | hosted login · credit balance · consume-on-use metering · out-of-credit banner · top-up checkout |
| 2 | **Metered API** (OG-image / screenshot API) | pay-as-you-go usage | API startup / CEO | usage metering at volume · month-end invoice · payment link · `invoice.paid` webhook |
| 3 | **Vertical SaaS** (booking+deposits or Free/Pro micro-SaaS) | subscription / tiered | non-technical founder | plans · entitlement gating · upgrade checkout · subscription lifecycle webhooks |

Together: **prepaid · usage · subscription** — beinfi's three archetypes — spanning
dev → founder → CEO, each a shape the market already recognizes and pays for.

## The pitch each one makes

- To the **dev**: "monetize your GPT wrapper this afternoon — login + credits + top-up in a
  few lines, no ledger, no Stripe."
- To the **founder**: "charge for your vertical SaaS without a billing team — plans,
  paywall, upgrades handled."
- To the **CEO**: "usage revenue and invoicing that would take a quarter to build — wired in
  an afternoon, with webhooks you can trust."

## Notes on what the examples will need (feature gaps to confirm while building)

Each app should end with a short **FINDINGS.md** DX report (effort scored, gaps logged).
The credit/subscription/checkout apps will exercise surfaces beyond auth+metering —
reading a credit balance, creating a checkout/payment link, handling billing webhooks,
and gating on a plan. Expect those to be the highest-leverage things to make one-liners.
