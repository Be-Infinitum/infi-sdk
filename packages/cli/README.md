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
| `infi login --token <session>` | Exchange dashboard session for API key (saved to `~/.config/infi/config.json`) |
| `infi keys list` | List tenant API keys |
| `infi keys create` | Create a new secret key |
| `infi keys revoke <id>` | Revoke a key |
| `infi sandbox create` | Provision claimable sandbox (`ref=cli`) |
| `infi sandbox get <id>` | Poll public sandbox status |
| `infi sync [file]` | Plan + apply `infi.company.ts` on the server (`--plan` to only plan; `--adopt-unmanaged`, `--overwrite-drift`, `--archive-orphaned`) |
| `infi pull [file]` | The tenant's document (`GET /config/document`) → `infi.company.ts` |
| `infi promote <crev_…>` | Take an applied sandbox revision to live, as a proposal |
| `infi providers [list]` | BYOP connection status (enterprise accounts only) |
| `infi providers verify <p>` | Re-check a stored credential after a key rotation |
| `infi doctor` | Setup health: products, merchant-of-record admission, env |
| `infi go-live` | Claim → merchant-of-record admission → live key |
| `infi deploy --url <url>` | Register webhook + write `INFI_WEBHOOK_SECRET` |
| `infi deploy vercel [--prod]` | Vercel deploy + env sync + webhook |

## Company as code: the server plans and applies

`infi sync` serializes the file to the company document (schema v1,
`https://api.beinfi.com/config/schema/v1.json`), asks the server for a plan
(`POST /config/plan`), prints it in the server's sentences, and applies it
(`POST /config/apply`, `Idempotency-Key = planHash`).

| Outcome | What you see | Exit |
|---------|--------------|------|
| Applied (sandbox) | The revision number; new webhook secrets, **once** (never written to disk) | 0 |
| Proposed (live) | The approval link. Nothing changes until a person approves it. Do not re-run to retry | 0 |
| Nothing to do | "the tenant matches the file" | 0 |
| Held | Each held change with the flag that resolves it, or why none can | 2 |
| Stale | The tenant moved since the plan: the new plan, nothing applied | 3 |

The three decisions a plan can wait on:

- `--adopt-unmanaged` — take over what the file names but no revision wrote
  (built by hand, or by a CLI older than 0.3.0: run this once after upgrading).
- `--overwrite-drift` — let the file win over an edit made in the dashboard since
  the last apply. `infi pull` keeps the edit instead.
- `--archive-orphaned` — archive what the file no longer names. Nothing is deleted,
  and anything a subscriber or a link still holds stays.

There is no lock file any more; delete `infi.company.*.lock.json`.

### Promotion

`infi promote <crev_…>` asks the sandbox to sign the document of an applied revision
(`--from-key sk_test_…` or `INFI_SANDBOX_SECRET_KEY`), then proposes that exact document
on live (`--to-key sk_live_…` or `INFI_LIVE_SECRET_KEY`) and prints the approval link.

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

`~/.config/infi/config.json` stores profiles after `infi login`.

## Development

```bash
bun run --filter @beinfi/cli build
bun run --filter @beinfi/cli dev -- sandbox create --json --local
```

## Going live

Selling live needs the merchant-of-record admission: Infi's UK Ltd is the seller of
record and you supply through it. The account owner applies in the dashboard at
[app.beinfi.com/go-live](https://app.beinfi.com/go-live); `infi go-live` and
`infi doctor` report where it stands. Connecting your own Stripe or Asaas (BYOP) is an
enterprise arrangement, not part of the default path.

## What this CLI does not do

Beinfi does not handle your end users' login — bring your own auth (Clerk, Supabase,
NextAuth, your own) and pass that user's id as `externalId`.
