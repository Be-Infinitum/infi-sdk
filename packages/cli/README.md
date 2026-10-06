# @beinfi/cli

Operator CLI for Infi — port of the Go `beinfi-cli`, built on `@beinfi/sdk`.

```bash
npm install -g @beinfi/cli
# or
bunx @beinfi/cli sandbox create
```

## Commands

| Command | Description |
|---------|-------------|
| `infi login [--device] [--rotate]` | Approve in the browser (or with a code, for agents); this project gets its own named `sk_test_`, reused on every later login, kept in the OS keychain and written to `.env.local` |
| `infi keys create --live` | This project's `sk_live_`, approved with a step-up in the dashboard |
| `infi template pack ecommerce` | The key-free template zip |
| `infi keys list` | List tenant API keys |
| `infi keys create` | Create a new secret key |
| `infi keys revoke <id>` | Revoke a key |
| `infi sandbox create` | Provision claimable sandbox (`ref=cli`) |
| `infi sandbox get <id>` | Poll public sandbox status |
| `infi sync [file]` | Apply `infi.company.ts` (`--plan` for dry-run) |
| `infi pull [file]` | Backend → `infi.company.ts` + lock |
| `infi providers [list]` | BYOP connection status (provider, webhook, publishable key) |
| `infi providers verify <p>` | Re-check a stored credential after a key rotation |
| `infi doctor` | Setup health: products, payment provider, env |
| `infi go-live` | Claim → connect provider → webhook → live key |
| `infi deploy --url <url>` | Register webhook + write `INFI_WEBHOOK_SECRET` |
| `infi deploy vercel [--prod]` | Vercel deploy + env sync + webhook |

## Global flags

- `--key sk_...` or `INFI_SECRET_KEY`
- `--profile <name>` — config profile (default: `default`)
- `--local` — `http://localhost:8088`
- `--json` — machine-readable output

## Scaffold

Use the separate scaffolder (not a subcommand):

```bash
npm create infi-app my-app
```

## Config

`~/.config/infi/config.json` keeps the profile (email, tenant, host) after `infi login`; the keys
themselves go to the OS keychain (macOS Keychain, libsecret), or a 0600 file where there is none.
The project's id is `.infi/project.json` — commit it, it is not a secret.

## Development

```bash
bun run --filter @beinfi/cli build
bun run --filter @beinfi/cli dev -- sandbox create --json --local
```

## Connecting a payment provider

There is no `infi providers connect`, on purpose. Connecting decides which account a
merchant's money lands in, so the backend gates it behind fresh MFA — and a step-up token is
only ever minted for a dashboard session, so an API key can neither obtain nor replay one.
Connect at [app.beinfi.com/go-live](https://app.beinfi.com/go-live); the CLI reports and
verifies.

## What this CLI does not do

Beinfi does not handle your end users' login — bring your own auth (Clerk, Supabase,
NextAuth, your own) and pass that user's id as `externalId`.
