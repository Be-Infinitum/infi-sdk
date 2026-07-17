# ADR 0003 — Scaffolding folds into the CLI (`infi init`); create-infi-app is a shim

**Status:** Accepted (2026-07)

## Context

`create-infi-app` was a separate package holding the whole scaffold flow (template
copy → provision sandbox → write env → install → db:push + setup), driven by
`@clack/prompts`. It already depended on `@beinfi/cli` for sandbox provisioning, so
the dependency direction already pointed at the CLI. Meanwhile `@beinfi/cli` owns the
rest of the tenant lifecycle (`login`, `keys`, `sandbox`, `sync`, `deploy`). Having
the "create a new app" step live in a second package split the prompt/scaffold code,
duplicated dependencies, and kept the lifecycle across two binaries — unlike the
Stripe-CLI model of one binary with all subcommands.

## Decision

Move the scaffold logic into `@beinfi/cli` as `infi init` (aliases `create` / `new`).
`create-infi-app` becomes a ~8-line shim that forwards `process.argv` to the CLI's
`initCommand` (exported as `@beinfi/cli/commands/init`), so `npm create infi-app`
keeps working zero-install. Templates are bundled into `@beinfi/cli` (its `prebuild`
runs `sync-templates`, `templates` is in `files`); `create-infi-app` no longer carries
templates or `@clack`/`@beinfi/sdk` deps.

## Consequences

- Single source of truth for scaffolding; the whole tenant lifecycle is one binary
  (`infi init|login|keys|sandbox|sync|deploy`), discoverable in one `--help`.
- Both entry points work: `infi init my-app` and `npm create infi-app my-app` (shim).
- `@beinfi/cli` gains `@clack/prompts` and ships templates; `create-infi-app` shrinks
  to a forwarder depending only on `@beinfi/cli`.
- Root `templates:sync` now targets `@beinfi/cli`; build order (cli before
  create-infi-app) already satisfies the shim's build-time dependency.

## Alternatives considered

- **Keep create-infi-app standalone.** Rejected: two sources for the scaffold code,
  duplicated deps, lifecycle split across binaries.
- **Kill create-infi-app entirely (only `infi init`).** Rejected: loses the
  `npm create infi-app` zero-install entry point, the ecosystem-standard first touch
  for new users. The shim keeps it at ~8 lines of cost.

## Non-goals

Changing templates, the provisioning flow, or the sandbox endpoints (ADR 0001).
Renaming the `infi` binary or other subcommands.
