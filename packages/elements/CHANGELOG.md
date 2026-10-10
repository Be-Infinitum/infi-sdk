# Changelog

## Unreleased

### BREAKING
- **Removed signals and feedback.** `createSignals` and the `FeedbackInput`,
  `SignalEvent`, `SignalKind`, `SignalsClient` and `SignalsOptions` types are gone,
  along with the `feedback` messages in `ElementMessages`. The backend
  `/public/signals/*` routes and the `signals:write` scope return 404. Major bump.
