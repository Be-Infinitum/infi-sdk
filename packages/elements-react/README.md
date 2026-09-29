# @beinfi/elements-react

```tsx
<InfiProvider slug="loja" environment="sandbox" appearance={{ accentColor: "#0a7" }}>
  <StoreElement store={await getStorefront(apiUrl, "loja")} href={(p) => `/product/${p.productId}`} />
  <CheckoutElement linkToken="plink_…" onComplete={…} />
  <PortalElement token={kept} onToken={keep} />
</InfiProvider>
```

No key in the browser: the checkout and the portal run in Infi's frames, the
store is read on your server. `onComplete` is not proof of payment — deliver
on the `payment.confirmed` webhook. Look: `appearance`, props, and CSS
(`--infi-accent`, `--infi-radius`, `--infi-border`, `--infi-muted`, `infi-store*`).
