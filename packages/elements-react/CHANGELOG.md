# Changelog

## Unreleased

### BREAKING
- **Removed signals and feedback.** `InfiSignals`, `useSignals`, `FeedbackElement`
  and the `createSignals` / `SignalsClient` / `SignalsOptions` re-exports are gone.
  `InfiProvider` no longer takes `publishableKey` (it only fed the signals). The
  backend `/public/signals/*` routes and the `signals:write` scope return 404.
  Major bump.
