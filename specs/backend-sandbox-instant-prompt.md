# Task: Sandbox instant + claim intents + go-live status (align with infi-sdk ADR 0004)

Implement backend changes so vibe-coding agents (Lovable/Cursor/Claude) get a **login-ready sandbox in one claim**, and so the SDK/CLI can guide **go-live** (claim → account → KYC). The TypeScript SDK/CLI already call these shapes — make the API match.

## Context (already shipped in infi-sdk)

- SDK infers API host from key (`sk_test_` → sandbox API, `sk_live_` → live API). Hosted login/checkout use `app.beinfi.com`. No AUTH/PAY URL env vars.
- CLI: `infi bootstrap --intent <crm|prepaid-ai-chat|one-time|usage-saas> --ref <lovable|cursor|mcp|cli> --app-url <url>`
- Claim already POSTs optional body fields (backend may ignore today):

```json
{ "ref": "lovable", "intent": "crm", "appUrl": "https://xxx.lovable.app" }
```

- CLI/MCP probe `GET /account/go-live` with `Authorization: Bearer sk_…` and expect JSON with `stage`, `next`, `urls`, `blockers`.

Read / mirror intent seeds from SDK: `companyFromIntent` in `@beinfi/sdk` (intents below). Prefer matching that catalog shape.

See also: `infi-sdk` ADR 0004 (`company as code + sandbox instant + go-live`).

---

## 1) Sandbox: skip origin / redirect / CORS allowlists

**Goal:** In **test/sandbox mode** (`sk_test_` or sandbox deployment), do **not** reject hosted login / CORS / redirect_uri because of missing `allowedOrigins` / `redirectUris`.

**Live mode** (`sk_live_`): keep strict allowlist enforcement.

Find every check that validates:

- `allowedOrigins` / CORS `Origin`
- `redirectUris` / `redirect_uri` against app config

Behavior:

| Mode | Behavior |
|------|----------|
| sandbox | Allow any `http(s)` origin/redirect (still validate URL shape; block `javascript:` etc.). Optionally still *store* allowlists if provided. |
| live | Enforce allowlist as today; clear error if missing/mismatch |

Add tests: sandbox login with unlisted preview URL succeeds; live with unlisted URL fails.

Document in an ADR or comment: “Sandbox is lax for vibe demos; live is strict.”

---

## 2) Claimables: accept `intent` + `appUrl` and seed company catalog

Extend `POST /public/v1/claimables`:

### Request (additive, backward compatible)

```json
{
  "ref": "lovable" | "mcp" | "cursor" | "cli" | "web",
  "intent": "crm" | "prepaid-ai-chat" | "one-time" | "usage-saas",
  "appUrl": "https://xxx.lovable.app"
}
```

- `intent` and `appUrl` are optional.
- If `intent` omitted: keep current claimable behavior (whatever you seed today).
- If `intent` present: after creating tenant + API key + app, **seed** published catalog so hosted login enrolls a customer immediately (no empty-product login loop).

### Intent seeds (match SDK)

**crm**

- Product key `crm`, type agent, pricingModel `usage`, currency BRL
- Meter `leads_ingested` (unit), price per_unit `0.10`
- App slug from claim (or `crm-*`), if `appUrl`: set `allowedOrigins=[appUrl]`, `redirectUris=[appUrl/callback]`

**prepaid-ai-chat**

- Product key `ai-chat`, prepaid monthly, basePrice `19.90`, meter `tokens`, prepaid_credits price
- App + origins if `appUrl`

**one-time**

- Product key `item`, type item, one_time, basePrice `29.90`
- App optional (checkout-only often needs no login)

**usage-saas**

- Product key `integration`, subscription monthly, meter `api_calls`, per_unit `0.01`
- App + origins if `appUrl`

All seeded products must be **published** (version + prices) so login / `GetOrCreateCustomerForIdentity` works.

### Response

Keep existing claimable response. Optionally add:

```json
{ "intent": "crm", "ready": { "login": true, "checkout": true } }
```

Update OpenAPI. Tests: claim with `intent=crm` → list products non-empty → session after login has customer.

---

## 3) Login session: include billing subject when possible

When exchanging/introspecting session in sandbox (and live if unambiguous):

- If tenant has products and customer is enrolled (or auto-enrolled on login), prefer session payload that makes wallet id obvious.
- Ideal: session includes `customer.id` that is the **enrollment / billing subject** used by credits/meter, OR add `wallet` / `enrollment` field:

```json
{
  "customer": { "id": "...", "email": "..." },
  "enrollment": { "id": "...", "productId": "...", "productKey": "crm" }
}
```

- Soft requirement: at minimum, **never** return a successful login with zero products and null customer without a typed error.

If login would create a session with no customer because products=0:

- Prefer claim intent seed (task 2) so this doesn’t happen
- Or return error code `no_products_for_login` with message agents can act on

---

## 4) `GET /account/go-live` (Bearer secret key or session)

Used by `infi go-live` / MCP. Auth: tenant secret key (`sk_test_` or `sk_live_`).

### Response shape (required)

```json
{
  "stage": "sandbox_unclaimed" | "sandbox_claimed" | "account_needed" | "kyc_pending" | "kyc_approved" | "live_ready",
  "mode": "sandbox" | "live",
  "next": "Human-readable next step for an AI agent to show the user",
  "urls": {
    "claim": "https://…",
    "dashboard": "https://app.beinfi.com",
    "account": "https://app.beinfi.com/signup",
    "kyc": "https://app.beinfi.com/kyc"
  },
  "blockers": [
    {
      "code": "claim_required" | "kyc_required" | "kyc_pending" | "live_key_required",
      "message": "…",
      "url": "…"
    }
  ],
  "canCreateLiveKey": false
}
```

### Stage mapping (adjust to your real account/KYC model)

1. Tenant still tied to unclaimed claimable → `sandbox_unclaimed` + claim URL
2. Claimed but no user account linked → `account_needed`
3. Account exists, KYC not started/incomplete → `kyc_pending` (+ kyc URL)
4. KYC approved, no live key yet → `kyc_approved`, `canCreateLiveKey: true`
5. Request authenticated with `sk_live_` or live keys exist → `live_ready`

Do **not** return live secret keys from this endpoint. Only URLs + status + whether live key creation is allowed.

OpenAPI + tests for each stage.

---

## 5) Feature wallet runtime — **out of scope for sandbox P0** (see ADR 0005)

Do **not** add a credit-only `onPayment.grantCredits` shortcut in this PR.

Long-term model (infi-sdk ADR 0005): backend is a **generic feature ledger**;
billing plans declare `grants[]`; SDK exposes `wallet.debit` / `wallet.credit`.

```ts
// App code (SDK target)
await wallet.debit("tokens", "120");
await wallet.credit("exports", "10");

// Company as code — plan owns grants (not webhook glue)
grants: [
  { feature: "tokens", amount: "50000", on: "cycle" },   // prepaid renew
  { feature: "tokens", amount: "100000", on: "payment" }, // one_time pack
]
```

| `on` | Replaces |
|------|----------|
| `cycle` | today’s `credits_per_cycle` / subscription `credit_grant` |
| `payment` | the deferred “auto-grant on payment.confirmed” |

**Rule:** one product+feature uses either `cycle` or `payment`, never both on the
same path. Idempotency by `payment_id` or `subscription_id+period`. Legacy
`credits.*` = shim for `feature: "credits"` (or product default).

### Recommendation for this backend task

- **Skip §5 entirely** in PRs A/B/C (allowlist, claim intent, go-live).
- When ready: implement generic ledger + `grants[]` on product version (ADR 0005),
  not a one-off credit auto-grant.

---



## 6) OpenAPI + migrations + tests

- Update `api/openapi.yaml` (or equivalent) for claimables request + go-live response
- Migrations only if you store `intent` on claimables
- Unit/integration tests for: sandbox CORS/redirect lax; live strict; claim+intent seeds; go-live stages
- Keep backward compatibility: claim without `intent`/`appUrl` still works

---

## Out of scope

- Changing live payment rails / KYC provider itself
- Frontend dashboard UI (unless needed for KYC URLs to exist)
- SDK changes (already done in infi-sdk)

## Success criteria

1. `POST /public/v1/claimables` with `{ "ref":"lovable","intent":"crm","appUrl":"https://foo.lovable.app" }` → tenant where hosted login works from that origin **without** a prior catalog sync.
2. Sandbox app with empty allowlist still accepts preview redirects; live does not.
3. `GET /account/go-live` with `sk_test_` returns coherent `stage` + `urls` for agents.
4. OpenAPI regenerated / committed; tests green.

Implement in small PRs if needed: (A) sandbox lax allowlist, (B) claim intent seed, (C) go-live endpoint.
