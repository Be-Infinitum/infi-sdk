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
| `infi sync [file]` | Apply `infi.billing.ts` (`--plan` for dry-run) |
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

`~/.config/infi/config.json` stores profiles after `infi login`.

## Development

```bash
bun run --filter @beinfi/cli build
bun run --filter @beinfi/cli dev -- sandbox create --json --local
```
