# Changelog

## Unreleased

### Removed — BREAKING: auth is no longer part of Beinfi

Beinfi is billing only; merchants bring their own auth (backend ADR 0025).

- `Login` — the hosted-login redirect route handler
- `Callback` — the auth-code exchange + session cookie handler
- `getSession`, `getSessionToken`, and the `GetSessionOptions` type
- types `CallbackOptions`, `LoginOptions`, `CookieOptions`

`Usage`, `State`, `withMeter`, `meterAction` and `guardCredit` are unchanged. They already
took a `resolveCustomerId` callback, which is now the only way identity reaches them:

```ts
resolveCustomerId: async (req) => (await mySession(req)).enrollmentId,
```

### Migration

Replace the two removed routes with whatever auth you already use (Clerk, Supabase,
NextAuth, your own). Nothing else in this package changes — the handlers never knew who the
user was; they asked you.
