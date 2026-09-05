# Changelog

## Unreleased

### BREAKING
- **`checkout()` now requires `customer.taxId`** in purchase mode, validated as a
  CPF (11 digits) or CNPJ (14). Pix and boleto on Asaas refuse to create a payer
  without one, the refusal arrives at charge time, and the public charge endpoint
  takes no `taxId` — so a customer created without it can never pay by pix or
  boleto and no client-side change rescues it. It used to be optional, which
  meant the failure landed in front of the buyer instead of on the integrator's
  keyboard. A truncated document is rejected too: presence alone passes a
  falsy check and then fails at the provider, which is the same late failure with
  an extra step.

  Card-only integrations that omit it will stop compiling. That is deliberate —
  the alternative is discovering it in staging, or worse, in production.

  Releasing this is a minor bump (0.12.0), which means the ranges in
  `@beinfi/nextjs` (`>=0.9.0 <0.12.0`), `@beinfi/cli` (`>=0.10.1 <0.12.0`) and
  `@beinfi/mcp` (`>=0.9.0 <0.12.0`) all have to widen in the same release or
  nothing resolves. `packages/mcp/scripts/smoke.mjs` fails the publish if they
  do not.

### Added
- **`links.create(productId, { slug, successUrl, cancelUrl })`** — where the
  hosted checkout sends the payer afterwards. `successUrl` gets
  `?status=success&invoice=<id>` appended once the payment confirms;
  `cancelUrl` is offered as "back to the merchant" while the checkout is open.
  Both must be absolute http(s) URLs (422 otherwise). The `PaymentLink` type
  carries them back. The hosted `/pay` page now honours the same two fields on
  invoices created with `checkout({ successUrl, cancelUrl })`, which it stored
  and ignored until now.
- **`@beinfi/checkout`**: `returnUrl` now appends `invoice=<id>` on success and
  redirects with `?status=error&code=<code>` when the checkout is over for the
  payer — `payment_expired` (new protocol code: the server's pix deadline
  passed), `session_expired`, `invoice_not_open`, `unavailable`. Retryable
  errors (declined card, missing CPF) never redirect.
- `@beinfi/checkout` ships a runnable example — `examples/index.html`, served over
  http from a plain directory. `localhost:5173` is an origin Infi could never have
  allowlisted, which is the point: it logs every protocol message a merchant's
  page would receive, and labels `complete` as not being proof of payment.


## 0.11.2

- Regenerate the API contract, including named agent provisioning and both test keys.
- Remediation hints (`err.fix`) for the codes the public checkout answers with:
  `customer_tax_id_required`, `charge_in_progress`, `charge_already_processing`,
  `method_switch_failed`, `invoice_not_open`. They reach a buyer mid-purchase, so
  each hint is something a payment surface can act on rather than a note to
  whoever reads the log later.
- Render per-meter balances from the current customer-state response; retain the legacy CreditSummary export for compatibility.


## 0.11.1 — 2026-08-26

Dois bugs achados **rodando** um app pré-pago contra produção. Nenhum aparece
lendo código.

### Fixed
- **O gate prepaid consultava a carteira errada.** `meter({ mode: "prepaid" })`
  lia `GET /metering/customers/{id}/credit` — o shim que o backend documenta
  como *"always reads the default credits (CRD) pool"*. Uma carteira com 50.000
  no meter `tokens` respondia `0` ali, e **toda** chamada de um produto prepaid
  real caía em `402` com o saldo em caixa. Medido no mesmo instante:

  ```
  GET /wallet?meter=tokens  ->  {"balance":"50000"}
  GET /credit               ->  {"balance":"0"}
  ```

  `checkCredit`/`assertCredit` passam a aceitar `meter`, e `meter()` repassa o
  seu. Sem `meter` continua no endpoint legado.

- **Produto cujo publish falhou ficava morto, e o `sync` reportava `skip`.**
  `currentVersion` caía para a maior versão de qualquer status, adotando um
  draft como atual. Os campos batiam e nada era publicado — o produto seguia
  invisível para qualquer comprador, sem sinal nenhum. Agora só versão
  publicada conta como atual, e um draft que já bate o desejado é publicado em
  vez de empilhar outro.

### Atenção ao atualizar
- **`SyncAction.action` ganhou `"publish"`.** Um `switch` exaustivo sobre essa
  união passa a acusar o caso novo. É a única mudança de tipo.
- **Se você compensava o bug do gate** creditando o pool `credits` legado para
  o `meter()` deixar passar, o gate agora lê a carteira do meter de verdade —
  confira os saldos antes de subir.

## 0.11.0 — 2026-08-26

Saiu de construir um app de crédito pré-pago contra a 0.10.7 publicada. Cinco
correções, três delas de drift entre a SDK e o backend.

### Breaking
- **`BillingPrice.meter` agora é obrigatório.** O tipo dizia "omit for a flat
  base fee" e o backend responde 422 exigindo `meterId` — mas só no *publish*,
  que `--plan` nunca alcança. O plano vinha verde e o apply quebrava no meio,
  com os produtos já criados. Valor flat vai em `basePrice`; `prices[]` é taxa
  por meter. `assertValidConfig()` roda antes de qualquer escrita, para quem
  chama de JS puro.

### Fixed
- **`sync` aplica grants `on: "payment"`.** Eram descartados como "not supported
  yet", enquanto o backend implementa desde a ADR 0021
  (`product_version_grants` + `internal/metergrant`). Todo top-up pré-pago
  precisava escrever endpoint de webhook, verificação de assinatura, resolução
  de produto, mapa produto→crédito, `wallet.credit` e idempotência própria —
  seis peças para o que a plataforma já fazia. Agora é uma linha:
  `grants: [{ meter: "tokens", amount: "500000", on: "payment" }]`.
- **Drift compara todos os grants.** `versionFieldsEqual` olhava só o de ciclo,
  então adicionar `on: "payment"` a um produto existente reportava `skip` e não
  aplicava nada. Só funcionava em produto novo.
- **Tipos de webhook derivam do OpenAPI.** Eram escritos à mão e divergiram:
  a união de eventos omitia `invoice.paid`, `payment.refunded` e
  `payment.chargeback` (quem lia concluía que não existiam);
  `PaymentConfirmedData` não tinha `customerId`; `CustomerCreatedData` não tinha
  `country`; e `payment.refunded` era mapeado em `PaymentFailedData`, perdendo
  `amount`, `currency` e `accessRevoked`. Um teste de contrato falha se
  divergirem de novo.

### Added
- **`WEBHOOK_EVENT_TYPES`** — lista de runtime dos eventos com payload
  documentado. `WebhookEventType` é `union | (string & {})`: o conhecido
  autocompleta, o desconhecido passa. O despacho no backend casa por
  `event_type = ANY(events)` sem allowlist, então fechar a união recusaria
  eventos reais.
- **`InvoicePaidData`, `PaymentReversedData`** e `customerId`/`payerId` em
  `PaymentConfirmedData` — acompanham a mudança de payload no backend
  (Be-Infinitum/backend#149).
- **Seção de webhooks no README**, com a chave de dedupe correta: a fatura, não
  o id do evento. Duas entregas com ids distintos para a mesma fatura ainda são
  uma compra só.

---

### Também nesta versão (era a 0.10.8, nunca publicada)

O npm foi de 0.10.7 direto para cá, então o que estava marcado como 0.10.8
sai junto — quem atualiza recebe as duas coisas de uma vez.

### Added
- **`infi.payments`** — `list()`, `get()`, `listForInvoice()`, `refund()`, `refunds()`.
  Refunds had a backend route, a contract entry, provider adapters and no SDK method
  at all: the only way to send money back was raw HTTP against a URL found in the
  route table. There was also no way to read what you had refunded — the query
  existed in generated code with no caller.
- **`payments.refund(id, { revokeAccess })`** and **`DeliverableGrant.revokedAt`**.
  A refund used to return the money and leave the buyer's download link working
  forever; the token has no expiry and there was no off switch. Now a FULL refund
  revokes it (the link answers `410 download_revoked`) and a partial one does not —
  R$5 back on a R$100 guide is goodwill, not a cancellation. `revokeAccess`
  overrides both ways; omit it to get the derived behaviour, which is the one you
  want. Requires the backend deployed with migration `000100`.
- **`Payment.refundedAmount`** — read this, never `status`, to tell a partial refund
  from a full one. A partial refund also sets `status` to `"refunded"`, so the
  status alone reports R$5 handed back as the entire sale reversed.
- **`Refund` type** and `GET /billing/payments/{id}/refunds`, the only place the
  individual amounts, dates and reason text are kept.

### Notes
- Refunding does **not** reverse prepaid credits. The money comes back and the
  credits stay spendable — deliberately, because a buyer who consumed 800 of 1000
  has no obvious right answer. Debit the remainder yourself.
- The invoice stays `paid` after a refund, on purpose: accounting reverses a fact
  rather than erasing it. Net your sales reports with `refundedAmount`.


## 0.10.7 — 2026-08-20

### Added
- **`infi.account`** — `get()` and `update({ name, termsUrl })`. A tenant starts with
  a placeholder name, so an un-renamed store shows the buyer a checkout that says
  **"New app"**. A cold-start test shipped a whole shop like that, found nothing in
  the docs or the SDK to change it, and had to guess `PATCH /account/tenant` from the
  HTTP route table. The route existed in the contract and nothing exposed it.
  Measured: the rename shows up on an already-created payment link immediately.

### Fixed
- **`missing_secret_key`'s fix said `infi claim create`** — a command that
  PROVISIONS A NEW TENANT. Two cold-start audits were told that while sitting in a
  project that already had one, so following it would have abandoned the tenant
  holding their product. A command that creates state is never the remedy for
  "cannot find your existing state". It is `infi doctor --json` now, and the hint
  spells out that `bootstrap` creates a tenant.

## 0.10.6 — 2026-08-20

### Fixed
- **`Payment` was missing three fields the API returns.** `sandboxConfirmUrl`,
  `providerPixPayload` and `pixQrImage` appeared ZERO times in 0.10.5's types while
  the API returned all three: two were added to the Go struct and never to the
  OpenAPI contract, and `pixQrImage` was in the contract but the generated types
  were stale. A cold-start test following our own documented snippet collected four
  `TS2339` errors on live fields. Contract updated, types regenerated.
- **`pay`'s docstring recommended the anti-pattern our docs forbid.** It said to
  detect sandbox with `pixPayload.startsWith("http")` — which passes every test you
  run and silently does nothing for real buyers, because in live the payload is an
  EMV. It now says to branch on `sandboxConfirmUrl` and to render the payload as a
  QR in both modes, which is the whole point: the merchant's rendering code does not
  change. The documentation was right and lost the argument to its own SDK.

## 0.10.5 — 2026-08-20

### Fixed
- **`err.fix.docs` pointed at files nobody outside this repo can read.** Six
  pointers went to `AGENTS.md#…` and one to `skills/…/SKILL.md`; neither ships in
  the package. All seven are public beinfi.com docs URLs now, and a test fails the
  build if a pointer stops being one.
- **`${err.fix}` printed `[object Object]`.** A cold-start tester hit exactly that,
  then followed the dead `docs` pointer. It renders one line now — hint, command,
  docs URL — via a NON-enumerable `toString`, so `JSON.stringify` and
  `InfiError.toJSON` keep emitting the plain object an agent parses.
- **`InfiErrorFix` is documented**, field by field, with the interpolation example.
  The shape was public API and had a one-line comment.

## 0.10.4 — 2026-08-19

### Fixed
- **`deliverable.presign()` returns `uploadUrl`/`objectKey` as plain strings.** Both
  are optional in the generated contract, so the documented three-step upload did
  not compile under `strict` — `fetch(uploadUrl)` rejects `string | undefined`.
  Same defect as `checkout().invoice.id`, found the same way: by compiling the
  docs. Throws `invalid_response` (502) if the API ever omits them.
- **0.10.3 shipped a stale `dist/`.** Its `package.json` said 0.10.3 but the bundle
  was built before the source changes below, so `invoices.deliverable` and
  `checkout().invoiceId` were missing from the published package while the docs
  referenced them. Root cause: no package had a `prepublishOnly`, so `npm publish`
  packed whatever `dist/` happened to be on disk. Every package in this repo now
  builds, typechecks and tests as a precondition of publishing. Use this version;
  0.10.3 is inert.

## 0.10.3 — 2026-08-19

### Added
- **`invoices.deliverable(invoiceId)`** — the download grants an invoice's payments
  produced (`paymentId`, `token`, `downloadUrl`, `emailSentAt`). Fulfillment already
  minted these and emailed them to the buyer, but nothing returned them, so a
  merchant who wanted to serve the file from their own thank-you page had no way to
  get the link and the buyer's inbox was the only delivery path. That matters more
  than it sounds: a buyer with no email address still gets a grant, so the sale was
  silently delivered only halfway. Returns `[]` (never 404) while the invoice is
  unpaid, so it is safe to poll.
- **`checkout()` returns `invoiceId: string`** alongside `invoice`. `Invoice.id` is
  optional in the generated contract, so `invoice.id` was `string | undefined` and
  every caller under `strict` needed a `!` to pass it to `pay.charge` /
  `waitForPaid` — including the snippets in our own docs, which did not compile as
  written. `checkout()` now asserts the id once and throws
  `invalid_response` (502) if the API ever omits it, instead of building a
  `/pay/.../invoices/undefined` URL that 404s for the buyer.

## 0.10.2 — 2026-08-19

### Added
- **Every mutating call now accepts an idempotency key** — 33 of 35, consistently.
  It was on roughly half the surface, which is worse than absent: a caller could not
  tell where they were allowed to rely on it. The two exceptions are `track` /
  `trackBatch`, which dedupe on the event's own `eventId` rather than a header.
- **README section on idempotency**, including the part that costs money: usage
  events dedupe on `eventId` **and** `timestamp` together. Sending the same
  `eventId` twice without a `timestamp` stores BOTH events and bills the usage
  twice — measured against the API, not assumed. Anything that replays usage must
  pin both fields to the event, never to the call.
- **`checkout()` and `pay.charge()` accept `idempotencyKey`.** They were the only
  two mutating calls that did not, and they are the two the "first sale" guide
  recommends — so its advice on collapsing a double-clicked Buy button was
  unactionable. An auto-generated key is per-call: it covers a network retry, not a
  second click, which is a second call. Resource methods (`products.create`,
  `invoices.create`, `coupons.create`, …) already took the key as a last argument.

## 0.10.1 — 2026-08-18

### Fixed
- **`sync` could not create a version at all.** `publishVersion` sent
  `creditsPerCycle`, which the backend dropped (migration 000098) and now rejects with
  `422 unrecognized field`, so every `syncBilling` / `infi bootstrap` run died on the
  first product. The cycle allowance now goes over as `grants: [{ meter, amount, on:
  "cycle" }]`, which is what the read path (`versionCycleGrant`, `infi pull`) already
  expected. `creditsPerCycle` on a config product still works — it maps onto a `credits`
  grant — but the field is deprecated on `VersionInput` because sending it to the API
  fails.
- **`sync` could not create a `sum` meter either.** Every aggregation but `count` needs a
  `valueProperty` and the API answers `422 "is required unless aggregation is count"`
  without one. It now defaults to `"value"`, which is the field `track({ value })` writes.
  This broke three of the four `infi bootstrap` intents (crm, prepaid-ai-chat, usage-saas).
- **`sync` was not idempotent.** The API echoes `tiers: []` on a flat price while a config
  omits the field, and `[]` is truthy, so the drift check compared `"[]"` to `""` and
  published a brand-new version on every run of a tenant that had not changed.
- **The `usage-saas` intent could not publish.** It declared a monthly subscription with no
  base price, which the API rejects (`basePrice must be greater than zero to publish a
  subscription version`). It now defaults to a `49.90` platform fee; `companyFromIntent`
  takes a `basePrice` option to override it, separate from the per-unit `price`.
- **`InfiError.fix` is populated for the codes the API really sends.** `INFI_ERROR_FIXES`
  only knew hand-written codes, so `fix` was `undefined` on every real `validation_failed`
  / `auth_001` / `unauthorized` / `not_found` — which the docs tell agents to read.

## 0.10.0

Fixes from the 2026-08-17 cold-start audit: payment links now work in sandbox, and a
rejected write tells you which field is wrong.

### Fixed
- **`InfiError` carries the API's field-level validation details.** A 422 answers
  `errors: [{ field, description }]`; the SDK used to drop it, so callers got a status
  and nothing else. It is now `err.errors` (always an array), it is in `toJSON()`, and
  the first description is folded into `err.message` — the generic *"One or more fields
  are invalid."* alone told you nothing. `parseErrorResponse` also reads the flat
  `error_code` the live API sends, so `err.code` (and therefore `err.fix`) is populated
  instead of `undefined`.
- **The app host is mode-aware.** `resolveApiBase` switched hosts per mode but the app
  base was the single constant `app.beinfi.com`, so every `sk_test_` caller got payment
  link and `checkout()` URLs on the live host, which 404. Sandbox now resolves to
  `app-sandbox.beinfi.com`. An explicit `appUrl` still wins.
- **An empty `slug` throws instead of building a broken URL.** `checkout()` interpolated
  a missing slug and handed back `…/pay/undefined/invoices/…`; untyped JS callers got no
  signal. `checkout`, `links.create` and `links.urlFor` now throw `missing_slug` (400,
  with a `fix` hint) — and `checkout` / `links.create` check before they create anything,
  so a bad call costs nothing. `links.list` without a slug still returns `url: ""`.

### Added
- `resolveAppBase(mode, override?)`, `SANDBOX_APP_BASE`, `LIVE_APP_BASE` — the app-host
  mirror of `resolveApiBase`.
- `InfiFieldIssue` — the `{ field, description }` shape of `InfiError.errors`.
- The `PaymentLink` type is exported. `PaymentLinkWithUrl` is defined in terms of it, so
  it should have been reachable from 0.9.0.

### Changed
- JSDoc on the public surface rewritten for the people who read it in an editor tooltip:
  no internal file paths, ADR numbers, competitor comparisons or product history. The
  operational warnings stay — `apiKeys` and `providers` are account-owner surface that an
  API key cannot reach, and `providers` is live-only.
- `Infi.sync` and the company-as-code exports are no longer marked "do not document or
  promote". Company as code is a documented, supported feature; the note was the stale part.
- `Payment.pixPayload` now documents both cases: an EMV/brcode string in live (render the
  QR from it), a simulator URL in sandbox (link to it, do not QR-encode it).
- `DEFAULT_APP_BASE` is deprecated — an alias of `LIVE_APP_BASE`. Use `resolveAppBase`.
- `CHANGELOG.md` now ships in the published tarball.

### Notes
- `@beinfi/nextjs`, `@beinfi/cli` and `@beinfi/mcp` widened their `@beinfi/sdk` range to
  `>=0.9.0 <0.11.0`. A caret on a 0.x version pins the *minor*, so `^0.9.0` would not
  resolve 0.10.0.

## 0.9.0

### Removed — BREAKING: the raw-PAN card path
Card capture put the PAN in the merchant's DOM and then sent it through our servers to be
tokenized, pulling both sides into PCI scope. Removed:
- `InfiCardForm`, `InfiCheckout`, `InfiPixQr` (from `@beinfi/sdk/react`)
- the `card` argument on `pay.charge()` and the `CardInput` type

`pay.charge({ method: "card" })` **stays**: it returns the `clientSecret` +
`publishableKey` of the provider routing picked, for the browser to confirm directly with
that provider.

### Added — payment links
- `infi.links.create/list/revoke/urlFor` — mint a shareable URL bound to a product. The
  payer fills in their own details; the customer and invoice are materialized on submit.
  New type `PaymentLinkWithUrl`.

### Removed — BREAKING: auth is no longer part of Beinfi

Beinfi is billing only; merchants bring their own auth. Everything
that existed to log an end user in is gone:

- `sendEmailCode`, `verifyEmailCode`, `getAppConfig`, `exchangeCode`,
  `exchangeCodeFromRequest`, `getSession`
- the `apps` resource (`apps.list/create/update`)
- `InfiLogin` (from `@beinfi/sdk/react`), `buildHostedLoginUrl`, `startHostedLogin`,
  `extractCodeFromUrl`, `extractTokenFromUrl`, `setSessionCookie`, `clearSessionCookie`
- company-as-code `apps[]`: `BillingApp`, `withAppUrl`, and the `appUrl` option on
  `defineCompany.fromIntent`. `infi sync` no longer patches origins.
- types `App`, `AppIdentity`, `AuthResult`, `SessionIntrospection`, `SessionMode`,
  `SessionPayload`, `HostedAppConfig`, `EmailCodeRequest`, `VerifyCodeRequest`,
  `ExchangeRequest`, `ExchangeCodeOptions`, `SendEmailCodeOptions`,
  `VerifyEmailCodeOptions`, `StartHostedLoginOptions`, `InfiRequestLike`,
  `InfiResponseLike`, and `CustomerSummary.identityId`

`exchangeCliToken` **stays** — that is operator/CLI auth (`/auth/cli/token`), not
end-user login.

### Changed — BREAKING

- **`wallet.fromSession(token, opts)` → `wallet.forCustomer(externalId, opts)`.** It still
  resolves productKey → product → enroll → starter credits → bound wallet; it just takes
  your own user id instead of an Infi session token. `Wallet.customerId` → `Wallet.externalId`,
  and `Wallet.session` is gone.

### Migration

```diff
- const wallet = await infi.wallet.fromSession(sessionToken, { productKey: "ai-chat" });
+ const wallet = await infi.wallet.forCustomer(myUserId, { productKey: "ai-chat" });
```

Replace Infi login with any auth you like (Clerk, Supabase, NextAuth, your own), then pass
that user's id as `externalId`. The enrollment id it returns is unchanged.


### Fixed
- `products.create` now unwraps the backend's `{ product, version }` response
  (previously returned the wrapper, so `.id` was undefined against the real API).
- `track` / `trackBatch` send an `Idempotency-Key` header and auto-generate a
  per-event `eventId` when omitted — the metering ingest requires both.
- `session(customerId, productId?)` stamps `productId` on each event (the ingest
  requires it). Verified end-to-end against the sandbox.

### Changed
- **`new Infi` takes `mode`, not base URLs.** Replaced `baseUrl`/`authBaseUrl`/
  `payBaseUrl` with `mode: "sandbox" | "live"` (inferred from the key prefix —
  `sk_live_` → live, else sandbox) plus optional `apiUrl`/`appUrl` overrides for
  local dev. The SDK resolves the API host from mode (sandbox →
  api-sandbox.beinfi.com, live → api.beinfi.com); you never pass a base for prod.
  React props and `@beinfi/nextjs` adapter options renamed `baseUrl` → `apiUrl`,
  `authBaseUrl` → `appUrl`. Constants `DEFAULT_API_BASE`/`DEFAULT_AUTH_BASE`/
  `DEFAULT_PAY_BASE` → `SANDBOX_API_BASE`/`LIVE_API_BASE`/`DEFAULT_APP_BASE`; new
  `modeFromKey`, `resolveApiBase`, and the `InfiMode` type.
- **Rename sandbox → claim**. "Sandbox" now means only
  test-vs-live mode; the provision-instant-creds-then-claim flow is a *claimable
  tenant*. CLI: `infi sandbox create|get` → `infi claim create|get`; `@beinfi/cli`
  helpers `createSandbox`/`getSandbox` → `createClaimable`/`getClaimable`, types
  `ClaimableSandbox*`/`SandboxRef` → `ClaimableTenant*`/`ClaimRef`. Scaffolded env
  `INFI_SANDBOX_ID`/`INFI_SANDBOX_CLAIM_URL` → `INFI_CLAIM_ID`/`INFI_CLAIM_URL`.
  Public endpoint `/public/v1/sandbox` → `/public/v1/claimables`.

### Added
- `infi.invoices.fromUsage({ customerId, from, to, send })` — roll an enrollment's
  accrued usage over a window into a finalized invoice on demand, rated server-side
  (backend `POST /billing/invoices/from-usage`; subscription-free). No more building
  usage line items by hand. New type `FromUsageInput`.
- `infi.session(customerId)` — a batching usage session (`track(...).track(...)` then
  `flush()`), sugar over `trackBatch`. New export `MeteringSession`.
- `examples/ai-agent-billing` — end-to-end demo: real OpenAI + Gemini calls, usage
  session, `fromUsage` invoice, webhook (ngrok + `verifyWebhook`) waiting for
  `payment.confirmed`.
- `infi.products.meters.update(productId, meterId, patch)` — update a meter's
  displayName / unit / aggregation (backend `PATCH …/meters/{id}`; `name` immutable).
  `infi.sync()` now reconciles meter metadata (create + update). New type
  `UpdateMeterRequest`.
- Billing-as-code desired-state sync: `infi.sync()` now **updates**
  product metadata and **version-bumps** on price / base-price / credits / billing-cycle
  changes (a new version is published; prior versions stay immutable), instead of
  seed-only. `SyncAction.action` gains `"update"` and `"bump"` plus a `detail` reason;
  `infi sync --plan` prints them.
- Billing-as-code platform config: `defineBilling()` accepts `apps`
  (matched by slug) and `webhooks` (matched by url); `infi.sync()` reconciles them
  create + update, never deletes, never rotates a webhook secret. Drift-guarded like
  products (a dashboard edit blocks an update unless `--force`); the lock tracks
  `apps`/`webhooks`; `infi pull` emits them. New types `BillingApp` / `BillingWebhook`
  / `EntityLock`; `SyncAction.resource` adds `app` / `webhook`.
- Drift guard + config versioning: `SyncOptions` accepts a previous `lock` and
  `force`; `SyncResult` returns `{ drift, lock }`. When a product changed in the
  dashboard since the last sync, an update/bump is **blocked** unless `--force`. The
  CLI persists `infi.billing.lock.json`; `infi pull` regenerates config + lock from
  the backend. New exports: `buildLock`, `SyncLock`, `ProductLock`, `DriftEntry`. Never deletes, never mutates a published version.
- `infi.coupons.list/create/get/delete/updateStatus` — tenant-wide merchant
  discounts for subscription invoices (`/billing/coupons`).
- `pay.applyCoupon({ slug, invoiceId, code })` — apply a coupon at public checkout,
  returns the discounted invoice.
- `pay.downloadUrl(slug, token)` — build the public deliverable download URL.
- `Coupon` / `CreateCouponRequest` types.

### Changed
- Regenerated OpenAPI types from the backend contract (coupons, customer state,
  deliverable download, ServiceUnavailable). `CustomerState` now aliases the
  generated schema instead of a hand-written interface (drift removed).

### Removed
- `infi.sandbox.create/get` and the `SandboxRef` / `ClaimableSandbox*` /
  `CreateSandboxOptions` types. Sandbox provisioning is a dev-time concern and now
  lives in `@beinfi/cli` (`createSandbox`/`getSandbox`), re-exported from
  `@beinfi/cli/lib/provision`. No app runtime called this.

## 0.8.1

### Added
- `infi.sandbox.create({ ref })` — provision a claimable billing sandbox (public, no auth).
- `infi.sandbox.get(id)` — poll public sandbox claim status.
- `infi.apiKeys.list/create/revoke` — tenant API key management.
- `exchangeCliToken()` — exchange dashboard session for CLI API key (`POST /auth/cli/token`).

## 0.8.0

Metered-LLM surface: a credit gate + usage recording in one call, plus a one-read customer view.

### Added
- `infi.meter(options, fn)` — gate credit, run `fn`, record its usage. Token usage auto-detected
  from OpenAI (`usage.total_tokens`) / Anthropic (`input_tokens + output_tokens`) shapes; override
  with `value`/`extract`; `skipGuard` opts out of the gate. Records only on success; returns `fn`'s
  result unchanged.
- `InsufficientCreditError` (status `402`, code `insufficient_credit`, fields `customerId`,
  `balance`) — thrown by `meter` before `fn` runs when the balance is exhausted.
- `infi.customers.state(id)` → `CustomerState` → `GET /metering/customers/{id}/state` (enrollment,
  credit, subscriptions, current-period usage).
- `UsagePanel` React component (`@beinfi/sdk/react`) — presentational credit/usage/subscriptions
  panel over a `CustomerState`.
- Companion `withMeter(options, handler)` App Router route gate in `@beinfi/nextjs`.

## 0.2.0

**Breaking.** Realigned the SDK to the real backend identity flow (email codes)
and removed the stale magic-link design.

### Removed
- `sendMagicLink()` / `validateMagicLink()` / `validateMagicLinkFromRequest()` and
  the dead `POST /identity/magic-link` and `POST /identity/validate` calls.
- `publishableKey` config and `InfiLogin`'s `publishableKey` prop. Public
  email-code endpoints need no key.
- `SendMagicLinkOptions`, `ValidateMagicLinkOptions`, `MagicLinkMode` types.

### Added
- `sendEmailCode({ slug, email, redirectTo?, state? })` → `POST /identity/apps/{slug}/email-code`.
- `verifyEmailCode({ slug, email, code })` → `POST /identity/apps/{slug}/verify-code`, returns `{ redirectUrl }`.
- `getAppConfig(slug)` → `GET /identity/apps/{slug}/config`.
- `track(event)` / `trackBatch(events)` metering ingestion → `POST /metering/events[/batch]`.
- Generated types from the backend OpenAPI contract (`src/generated/openapi.ts`),
  re-exported as `EmailCodeRequest`, `VerifyCodeRequest`, `HostedAppConfig`,
  `AuthResult`, `AppIdentity`, `UsageEvent`, `IngestResult`, etc.

### Changed
- `InfiLogin` is now a two-step email → code form that redirects to the returned
  `redirectUrl`. New props: `slug`, `redirectTo`, `state`, `onVerified`.
- `exchangeCode` / `exchangeCodeFromRequest` and the hosted helpers
  (`buildHostedLoginUrl` / `startHostedLogin` / `extract*`) are unchanged.
- Example app renamed `next-magic-link` → `next-email-code`.
