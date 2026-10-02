# @beinfi/elements

Infi elements, headless — the Whop Elements model: this core, and React
components in [`@beinfi/elements-react`](../elements-react). Semver; the API
answers the previous date-version for 12 months.

- **Checkout** — `createCheckoutEmbed`, `buildEmbedUrl` and the `checkout/v1`
  protocol. `@beinfi/checkout` is now the legacy entry point and re-exports
  these under its old names.
- **Portal** — `createPortalEmbed(el, { slug, mode, token?, onToken })`: the
  buyer's "Minhas compras" in Infi's frame; the token comes back by
  postMessage (origin, namespace and embed id checked), never in a URL.
  `createPortalClient({ apiUrl, slug, token?, getToken? })` for the same calls
  from your own UI through a same-origin proxy.
- **Store** — `getStorefront(apiUrl, slug)`, on your server: prices from Infi.
- **Appearance** — `resolveAppearance({ business, product, link })` is the
  server's table (link → product → business → default, per field) with each
  value's `source`, for an editor showing what is inherited;
  `appearanceCssVars(appearance)` is the one place a font name becomes a font
  stack and a radius name a length (`--infi-accent`, `--infi-background`,
  `--infi-font`, `--infi-radius`, `--infi-button-radius`, …). The elements
  never load a web font: the page does.
- **Preview** — the data the React elements' `preview` prop draws from, never
  calling Infi: `ElementPreview`, `previewProductFromDraft(draft)`, the
  example buyer (`EXAMPLE_BUYER`, `exampleMemberView`, `exampleCourse`) and
  `previewStorefront` (the draft on the shelf, `storeVisible` honored).
