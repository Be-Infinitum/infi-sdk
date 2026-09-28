# @beinfi/elements

Infi elements, headless — the Whop Elements model: this core, and React
components in [`@beinfi/elements-react`](../elements-react). Semver; the API
answers the previous date-version for 12 months.

- **Checkout** — `createCheckoutEmbed` and friends, re-exported from
  `@beinfi/checkout` (which stays as the legacy entry point).
- **Portal** — `createPortalEmbed(el, { slug, mode, token?, onToken })`: the
  buyer's "Minhas compras" in Infi's frame; the token comes back by
  postMessage (origin, namespace and embed id checked), never in a URL.
  `createPortalClient({ apiUrl, slug, token?, getToken? })` for the same calls
  from your own UI through a same-origin proxy.
- **Store** — `getStorefront(apiUrl, slug)`, on your server: prices from Infi.
