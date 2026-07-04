# Spec — create-infi-app (capstone)

**Status:** Implemented (v0.1). SDK sandbox + `@beinfi/cli` + default template + template picker.

## Vision

`npm create infi-app` → a founder goes from zero to a running, **billable** app in one command:
pick a starter, we **auto-provision an Infi sandbox** and write the keys into
the app's `.env`. "create-next-app for revenue infrastructure."

## Flow

```
npm create infi-app my-app
  → pick a starter:   default · CRM · Ebook · AI chat · Marketplace
  → scaffold:         copy templates/<starter> → rename → install
  → provision:        infi sandbox create (ref=cli) → write sk_test_ + claim URL
  → setup:            infi.billing.ts sync + app origins
  → next steps:       print claim URL + `bun run dev`
```

## Pieces

1. **Templates** — `templates/*` (published `@beinfi/sdk` deps). Default includes **`infi.billing.ts`**.
2. **`@beinfi/cli`** (`infi`) — login, keys, sandbox, sync. TypeScript port of Go `beinfi-cli`.
3. **`create-infi-app`** — scaffold + provision. Uses `@beinfi/cli/lib/provision`.
4. **Billing as code** — `infi.billing.ts` + `bun run setup` / `infi sync`.

## Publish

```bash
bun run publish:dry-run
bun run publish:packages   # npm login required
```

## Open

- Backend must accept `ref: "cli"` on `POST /public/v1/sandbox`.
- `infi login` browser flow (today: `--token` paste).
