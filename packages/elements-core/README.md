# @beinfi/elements-core

The calls behind Infi's elements. The components copied into your project
(shadcn-style) are UI only; the money logic lives here and on Infi's server.
Semver: a breaking change is a major, and the API answers the previous
date-version for 12 months.

- `createPortalClient({ apiUrl, slug, token?, getToken? })` — the buyer's
  "Minhas compras": login by 6-digit code, orders, downloads, subscriptions,
  cancel at period end and undo, change card with no charge (Stripe), refund
  request. Sensitive actions take a fresh-code grant (`requestActionCode` →
  `confirmActionCode`), or a `portal:write` token your server minted.
- `createPortalEmbed(el, { slug, mode, token?, onToken })` — the portal in
  Infi's frame; the token comes back by postMessage (origin, namespace and
  embed id checked) and never goes in a URL.
- `getStorefront(apiUrl, slug)` — the store as a buyer reads it, prices from
  the server.
