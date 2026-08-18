# Cold-start audit — docs + SDK, 2026-08-17

An agent with **no project context** was given only two sources — the eight `.mdx` files in
`landing/content/docs/` and the published `@beinfi/sdk@0.9.0` (README + shipped `.d.ts`) — and
told to build something that sells a product and takes a payment. It was forbidden from
reading `backend/`, `infi-sdk/` or `frontend/`, and told that a gap in the docs is a finding,
never something to resolve by reading the implementation.

**Result: it succeeded, and almost none of it came from the docs.** Three sandbox invoices
reached `paid` with a gated download. It got there by calling a raw endpoint the docs mention
in passing, reading `dist/index.d.ts` line by line, monkey-patching `globalThis.fetch` to
recover an error the SDK deletes, and brute-forcing an undocumented endpoint over six failed
requests. Its rating: **3/10 for a newcomer** — "prose above average, everything operational
broken".

Full raw log with verbatim HTTP: `scratchpad/docs-test-2/RELATORIO.md`. Working store:
`scratchpad/docs-test-2/store.mjs`.

### Reading this document

Every item carries evidence copied from the run. Items marked **[verified]** were reproduced
independently afterwards against the code; the rest are the agent's observation, which is
strong (it quotes wire output) but was not re-checked.

Two caveats that affect interpretation:

- **The backend was not deployed at test time.** 16 files of fixes made earlier that day were
  uncommitted, so `api-sandbox` still ran the old code. Items #8 and #12 are already fixed
  locally and are waiting on a deploy, not on new work.
- **Some findings are self-inflicted from that same day** — #3 and #9 came out of changes made
  hours before the test. They are marked.

---

## P0 — a newcomer cannot start

### 1. `npx @beinfi/cli` fails for everyone — the package is published but uninstallable **[verified]**

At test time the package was not on the registry at all:

```
$ npx -y @beinfi/cli bootstrap --intent one-time --ref cli --json
npm error 404 Not Found - GET https://registry.npmjs.org/@beinfi%2fcli - Not found
```

`@beinfi/cli@0.1.0` was published shortly afterwards, which changes the error but not the
outcome — a clean install still fails, because the published tarball carries the workspace
protocol:

```
$ npm view @beinfi/cli dependencies
{ "@beinfi/sdk": "workspace:*", … }

$ npm install @beinfi/cli          # empty dir, outside the monorepo
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

`workspace:*` is a monorepo-local protocol; npm cannot resolve it from the registry. Same defect
in `@beinfi/mcp` and `create-infi-app`.

Fixed locally: real semver ranges (`@beinfi/sdk: ^0.9.0`, `@beinfi/cli: ^0.1.1`), all three
bumped to `0.1.1`. Proven before publishing by packing the tarball and installing it in an empty
directory — 6 packages resolved, `infi --help` runs. **Needs a republish as 0.1.1**; `0.1.0`
stays broken on the registry forever and should be deprecated.

Next domino to check: `infi bootstrap --intent …` is the CLI's first documented command, and
finding #7 shows the public claimables endpoint *rejects* `intent`. Installing the CLI may not
be enough to make §1 of the quickstart work.

Blast radius across the docs set: `inicio-rapido.mdx` §1 (the front door), all six rows of the
`company-as-code.mdx` command table, all five flow steps in `sandbox.mdx`, `introducao.mdx`'s
`infi go-live --json`, and the whole of `lovable.mdx` including its seven-tool table. Roughly a
third of the docs points at software nobody can install.

**There is no fallback sentence anywhere in the eight pages** — no signup URL, no dashboard
link, no API-key page. In the agent's words: *the funnel has no floor*.

- [x] Replace the `workspace:*` deps with real ranges (cli, mcp, create-infi-app → 0.1.1)
- [ ] Publish `@beinfi/cli@0.1.1`; deprecate `0.1.0` (`npm deprecate "@beinfi/cli@0.1.0" "broken deps, use 0.1.1"`)
- [ ] Decide whether `@beinfi/mcp` / `create-infi-app` ship too — `lovable.mdx` needs mcp
- [ ] Verify `infi bootstrap --intent` actually works end to end (see #7)
- [ ] Add a no-CLI path to a key in `inicio-rapido.mdx` §1 anyway (see #4) — one curl, no install

### 2. `links.create` fails with 422 and the SDK throws away the reason **[verified]**

The flagship one-liner, run verbatim:

```
FAILED: InfiError | One or more fields are invalid.
status: 422 code: undefined fix: undefined hint: undefined
keys: [ 'status', 'code', 'fix', 'name' ]
```

The server is helpful; the SDK is not. Recovered only by intercepting `fetch`:

```json
{"error_code":"validation_failed","message":"One or more fields are invalid.",
 "errors":[{"field":"productId",
   "description":"product has no published version; publish it before creating a payment link"}]}
```

Root cause, confirmed in `packages/sdk/src/errors.ts`: `InfiError` declares
`{ status, code?, fix? }` — **there is no field that can hold a per-field detail**, so
`errors[]` is dropped at parse time. The one sentence that solves the problem is unreachable
through the public SDK.

Aggravating: `company-as-code.mdx` tells agents to "leia `InfiError.fix.command` / `hint`", and
both were `undefined` on every error the run hit (422, 500, 503, 404).

- [ ] Add `errors: FieldIssue[]` to `InfiError`, populate it in `parseErrorResponse`, include it in `toJSON()`
- [ ] Make `message` fall back to the first field description when the top-level message is generic

### 3. Sandbox payment links point at the production host and 404 — *self-inflicted, same day* **[verified]**

```
links.create -> https://app.beinfi.com/pay/app-e6f44c8b/links/plink_8c05af…   (key is sk_test_)

$ curl https://api.beinfi.com/pay/app-e6f44c8b/links/plink_8c05af…
{"message":"Payment link not found."}
$ curl https://api-sandbox.beinfi.com/pay/app-e6f44c8b/links/plink_8c05af…
{"merchant":{…},"product":{…},"testMode":true}      # resolves fine on sandbox
```

The asymmetry, in `packages/sdk/src/types.ts`:

```ts
resolveApiBase(mode) → api-sandbox… | api.beinfi.com   // mode-aware ✅
DEFAULT_APP_BASE = "https://app.beinfi.com"            // single constant ❌
```

`links.create` was written on 2026-08-16 using `this.#appBase` without noticing the app host is
not mode-aware. So the feature chosen as V1 does not work in the environment developers test in.
`checkout()` has the same defect.

Worse, the docs *forbid* the workaround: `inicio-rapido.mdx` and `nextjs.mdx` both carry a warn
callout saying "Não sete `INFI_AUTH_BASE_URL` nem `INFI_PAY_BASE_URL`. O SDK infere API +
`app.beinfi.com` a partir da chave" — asserting the broken behaviour as correct. The `appUrl`
option that fixes it appears only in the README's config table, never connected to this problem.

- [ ] Make the app base mode-aware (`resolveAppBase(mode)`, `app-sandbox.beinfi.com` for sandbox)
- [ ] Fix the warn callout in both doc pages

### 4. The prerequisite chain for selling anything is documented nowhere

`link-de-pagamento.mdx` presents `links.create(productId, { slug })` as complete — *"não tem
nada pra construir do seu lado"*. The real chain the agent had to reverse-engineer:

```js
const product = await infi.products.create({ key, name, type: "item",
  pricingModel: "one_time", currency: "BRL", basePrice: "49.90" });
const [draft] = await infi.products.versions.list(product.id);
await infi.products.versions.publish(product.id, draft.id);   // mandatory, undocumented
await infi.products.deliverable.save(product.id, { kind: "link", url });
const link = await infi.links.create(product.id, { slug });   // the only documented line
```

Five calls, four undocumented, to reach the one the docs present as the whole story. And
**where `productId` comes from is never answered on any page**, despite appearing in six code
samples across three pages.

`products.create`, `versions.*`, `prices.*`, `deliverable.*`, `checkout()`, `pay.*`,
`invoices.*`, `subscriptions.*`, `coupons.*` and `webhooks.*` are absent from every `.mdx` page
**and** from the README. The documented surface is roughly 15% of the SDK.

- [ ] Write a catalog page: product → version → price → publish, and where `productId` comes from
- [ ] Document `infi.checkout()` — the agent called it "the most useful call in the SDK" for selling from your own page

---

### 20. `checkout()` drops `taxId`, so it cannot produce a pix-payable customer on Asaas **[verified 2026-08-18]**

Found while pre-flighting the third run, after sandbox moved to real Asaas test mode
(ADR 0028). Asaas refuses to create a PSP customer without a CPF/CNPJ:

```
infi.checkout({ slug, productId, customer: { externalId, email, name, taxId: "52998224725" } })
→ pay.charge(pix) → 422 "A CPF/CNPJ is required to process this payment."
```

`checkout()` builds the customer body by naming three fields explicitly —
`externalId`, `email`, `name` — so a `taxId` passed by the caller is silently
dropped, and `CheckoutOptions.customer` has no `taxId` on the type either. The
result: the "sell from your own page" path **cannot complete a pix charge on
Asaas at all**.

This was invisible while sandbox ran the self-built simulator, which did not
require a tax id. Moving to real Asaas bought exactly the fidelity ADR 0028 wanted
and immediately surfaced a real gap.

`products.enroll(productId, { …, taxId })` DOES accept it and returns an
enrollment. But feeding that id to `checkout({ payerId })` answers 404, so the
obvious workaround does not connect either — `payerId` appears to want a
tenant-level customer id rather than the enrollment. Undocumented, and the two
ids are indistinguishable UUIDs.

- [ ] Add `taxId` to `CheckoutOptions.customer` and forward it
- [ ] Document which id `payerId` takes, or make it accept either
- [ ] Docs: say that pix on Asaas requires a CPF/CNPJ from the payer

## P1 — the sandbox loop is not closable

### 5. Nothing documents how to settle a sandbox payment, and the obvious route is a dead end

Six probes before finding it:

```
POST /sandbox/payments/{id}/confirm            -> 404 page not found
POST /sandbox/pix/{id}/confirm  {}             -> 422 field "action", "must be one of: pay, fail"
POST /sandbox/pix/{id}/confirm  {"action":"pay"}   -> same 422
POST /sandbox/pix/{id}/confirm?action=pay          -> same 422
POST /sandbox/pix/{id}/confirm  (form action=pay)  -> same 422
POST /sandbox/pix/{id}/pay                     -> 200 {"status":"confirmed"}   <- the real one
```

`/confirm` advertises an `action` value it accepts in no shape the agent could find, while the
working route is `/pay`. That error message is actively misleading.

- [ ] Fix or remove `/sandbox/pix/{id}/confirm`
- [ ] Write a sandbox-testing page: settling pix/boleto/card, what `provider: "sandbox"` is

### 6. `webhooks.create` returns 503 in sandbox — you cannot be notified a payment happened

```
1 FAIL 503 Webhook secrets cannot be stored right now. Please try again later.
2 FAIL 503 …
3 FAIL 503 …
```

The shipped types carry a `secret_store_unavailable` code, so this is a known mode: the secret
store is not available to a sandbox tenant. Consequence: no `payment.confirmed`, no
`invoice.paid`; polling `pay.waitForPaid` is the only option and no doc says so. There is also
no webhooks page at all — no event catalogue, no payload example, no `verifyWebhook` walkthrough,
despite the SDK shipping typed `WebhookEventMap`.

- [ ] Decide: make webhooks work in sandbox, or document the limitation and point at polling
- [ ] Write a webhooks page

### 7. The seeded product is unsellable, and `intent` is rejected by the public endpoint

```json
{"id":"388c95da-…","name":"App usage","type":"agent","pricingModel":"usage","status":"active"}
```

No `key`; version 1 is `draft`; no price. So it cannot be sold, and the docs' own example
`wallet.forCustomer(id, { productKey: "ai-chat" })` — in `inicio-rapido.mdx`, `sdk.mdx` and
`lovable.mdx` — cannot run against the tenant the docs tell you to create.

And the intent knob is unreachable:

```
-d '{"intent":"one-time","ref":"cli"}'  -> {"message":"Request body is not valid JSON."}
-d '{"ref":"cli"}'                      -> 200 (works)
```

`{"intent":"one-time"}` **is** valid JSON — the API reports a bad/unknown field as malformed
JSON, which cost the agent seven requests. With the CLI unpublished there is no reachable way
to pick an intent, so the four-intent table in `company-as-code.mdx` describes nothing usable.

- [ ] Make the seed sellable (key + published version + price), or stop promising a seeded catalog
- [ ] Accept `intent` on the public claimables endpoint, or remove it from the docs
- [ ] Stop reporting unknown fields as "not valid JSON"

### 8. `products.prices.add` → 500 with a blank body — **fixed locally, awaiting deploy**

```
POST /metering/products/…/versions/…/prices
500 {"message":"","tracer_id":"a60f6719…","error_code":"internal_error"}
```

Root cause found and fixed the same day: validation errors were built as
`(&baseexception.DomainException{}).WithField(...)` — a kindless exception, which fell through
`writeDomain`'s `default` branch to a 500 whose body dropped `Fields` entirely. Twelve call
sites. Now render 422 with the field detail. Also fixed: the ValidationIssue branch blanked the
default message whenever the exception carried none.

- [ ] Deploy the backend (see also #12)

---

## P2 — correctness, leaks and drift

### 9. The published `.d.ts` ships internal engineering notes to customer tooltips — *self-inflicted, same day* **[verified]**

```
dist/index.d.ts:884  * …an API key can neither obtain nor replay one (internal/auth/stepup.go).
dist/index.d.ts:896  * …the same split gr4vy draws between its dashboard and the API…
dist/index.d.ts:477  * (backend ADR 0012). The money lands in their account…
dist/index.d.ts:832  * …Pulse no longer sells login, so the caller…
```

Lines 884 and 896 were written hours before the test, as `@internal` rationale on `providers`
and `apiKeys`. `@internal` does not strip anything without `stripInternal`, so internal Go file
paths, ADR numbers, a competitor comparison and product history now ship in editor hover text
of a published package. Wrong audience: source comments explain to maintainers; JSDoc on public
API explains to customers.

`sdk.mdx` does the same in public prose — "(ADR meter wallet)", "shim do pool legado CRD" — and
CRD, Pulse and ADR numbers are defined nowhere in the docs.

- [ ] Rewrite the `@internal` blocks to say only what a caller needs, no paths/ADRs/competitors
- [ ] Purge ADR references and internal vocabulary from `sdk.mdx`
- [ ] Decide whether the real fix is the `@beinfi/sdk/internal` subpath (see #15)

### 10. The error envelope in the contract does not match the one on the wire **[verified]**

Shipped types declare `{ error: { code, message, request_id, details[] } }`; the live API returns
flat `{ message, tracer_id, error_code, errors[] }`. Verified: `api/openapi.yaml` uses
`request_id`, while `internal/platform/httperror` writes `tracer_id`. Meanwhile the README
claims *"Types are generated from the Infi OpenAPI spec, so requests and responses stay in sync
with the API."*

This is the same root cause as #2 from the other side: the generated types cannot describe
`errors[]` because the contract does not.

- [ ] Reconcile the contract with the code (field name, nesting, `errors[]`), then regenerate
- [ ] Publish an error-code reference — `error_code` values are in the types, in no doc

### 11. `checkout()` builds a URL containing the literal string `undefined` **[verified]**

```
hosted checkout URL: https://app.beinfi.com/pay/undefined/invoices/9cc06a52-…
```

Reclassified after checking: `slug` **is** required on `CheckoutOptions`, so this came from
omitting it in an untyped `.mjs`. The defect is that the SDK silently produced a broken URL
instead of failing — a JS caller gets no signal at all.

- [ ] Throw on a missing/empty `slug` rather than interpolating it

### 12. `providers.list()` → 404 in sandbox, undocumented

`introducao.mdx` says "Você conecta a **sua** conta Stripe ou Asaas" and never mentions that the
provider surface is live-only, nor that sandbox has a built-in fake `provider: "sandbox"` that
does the charging. Both are minute-one facts.

Related work already done locally: the three key-reachable provider routes now require
`account:admin`, and migration `000099` retired "empty scopes = full access". **Neither is
deployed.** Note the deploy order: 000099 must run *before* the binary, or every legacy key
403s.

- [ ] Document live-only + the sandbox provider
- [ ] Deploy, migration first

### 13. `pixPayload` is a simulator URL in sandbox, but the type says it is an EMV string

The `.d.ts` says *"the copy-paste EMV string (render the QR client-side)"*. In sandbox it is
`https://app-sandbox.beinfi.com/sandbox/pix/…`. Following the comment renders a QR of an https
URL. No doc mentions the difference.

- [ ] Document it, and reword the type comment

### 14. The claim URL host in the docs is wrong

`sandbox.mdx` and `lovable.mdx` state `https://new.beinfi.com/claim/{id}`; the API returns
`https://app-sandbox.beinfi.com/claim/{id}`. `new.beinfi.com` appears in no real response.
(The backend data-model also documents `new.beinfi.com`, so contract and runtime disagree too.)

- [ ] Establish which host is real and correct the losers

### 15. The docs and the SDK contradict each other about `company-as-code`

`company-as-code.mdx` is a public page whose purpose is documenting and promoting `sync`. The
shipped `.d.ts` says on that same method: *"Deliberately left out of the README … **Do not
document or promote it** until that decision is revisited."* A newcomer can read both.

The decision on 2026-08-17 was to **keep** company-as-code. So the `@internal` note is the part
that is now wrong.

- [ ] Reconcile: either drop the `@internal` note, or retire the page

### 16. README and docs recommend different APIs for the most important object

- README: `enrollmentId`, obtained from `products.enroll`; `customerId` is "an alias"
- docs: only ever `customerId: wallet.enrollmentId`, obtained from `wallet.forCustomer` or `customers.create`

`products.enroll` never appears in the docs; `wallet.forCustomer` never appears in the README.

- [ ] Pick one vocabulary and one recommended call, then align both

### 17. The deliverable download token is unreachable

`deliverable.save` works and `pay.downloadUrl(slug, token)` exists, but **no call anywhere
returns that token** — not on the invoice, the payment, or `customers.state`. Presumably it is
emailed by fulfillment, which no doc describes. So "produto digital com entrega por email"
(a line added to `link-de-pagamento.mdx` on 2026-08-16) is a promise the agent could set up but
neither verify nor serve; it hand-rolled its own download.

- [ ] Expose the grant/token, or document that the email is the only delivery and stop implying otherwise

### 18. Docs are Portuguese-only; the README is English, and they disagree

The npm README is the first thing most people read. The docs live only under `/pt-br/`. Beyond
language, the two disagree on vocabulary (#16). No "docs for SDK 0.9.x" marker, no changelog, no
deprecation notes beyond `skipGuard`.

- [ ] Decide the language policy
- [ ] Add a `CHANGELOG.md` — 0.9.0 shipped a breaking change with only a commit message as record

### 19. The API base URLs are written down nowhere

`api.beinfi.com` / `api-sandbox.beinfi.com` appear in no doc. The agent learned them by printing
`new Infi(key).apiBase`. Fine for SDK users; useless for anyone doing curl, debugging DNS, or
allow-listing egress.

- [ ] Put both hosts in the docs

---

## What the agent said was worth most

> Replace `inicio-rapido.mdx` §1 with a path that works today:
>
> ```bash
> curl -X POST https://api-sandbox.beinfi.com/public/v1/claimables \
>   -H 'Content-Type: application/json' -d '{"ref":"cli"}'
> # -> { tenantSlug, productId, apiKeySecret: "sk_test_…", claimUrl, expiresAt }
> ```
>
> Four lines that hand a newcomer a key, a slug **and the `productId` every other page assumes
> they have**, plus the API host that is currently written down nowhere.

Runner-up: `errors[]` on `InfiError` (#2) and a mode-aware app base (#3) — two small SDK changes
that turn the flagship feature from broken into working.

## Method note

`landing/CLAUDE.md` was auto-injected into the agent's context while it read the docs directory.
It confirmed the repo names and nothing else; the agent reports that no finding drew on it, and
every fact above traces to the eight `.mdx` files, the npm README, the shipped `.d.ts`, or wire
output quoted verbatim. The isolation is good but not airtight — worth knowing when weighing
anything here.
