# Changelog

## 0.1.7 — 2026-10-16

Needs `@beinfi/sdk` 0.12.1 and `@beinfi/cli` 0.2.8.

### Fixed
- **An agent can no longer apply in live.** `infi_sync_apply` refuses any key that
  is not a sandbox key (`sk_test_`), before any network call, with a message that
  sends the agent back to the human: in live the agent only proposes
  (`infi_sync_plan`, still allowed), the human applies with `infi sync` — or,
  once it exists, approves in the dashboard. `force` never reaches a live apply.
  `infi_bootstrap`, `infi_onboard` and `infi_claim_create` refuse too when the
  server is configured with a live key: provisioning a sandbox would rewrite a
  live project's `.env.local`.
- **`infi_sync_apply` uses the project's lock.** It reads and writes
  `infi.company.<mode>.lock.json` in `cwd` (the argument, else the project from
  onboard/bootstrap, else the server's cwd). Without it, the new drift guard would
  block every apply on an existing tenant. A blocked apply is returned as an
  error, not as a partial success.

## 0.1.5

- Conversational onboarding collects missing email, account name and intent; returns a human claim link.
- Provision both sandbox keys and resume the same project without overwriting app configuration.


## 0.1.3 — 2026-08-20

### Fixed
- **0.1.2 still could not run.** The double shebang was fixed, and the next layer
  showed up: this package declared `"@beinfi/cli": "^0.1.1"`, and a caret on a
  `0.x` version pins the MINOR — so it could never install 0.2.x, where
  `@beinfi/cli/skills` lives. Users got
  `ERR_PACKAGE_PATH_NOT_EXPORTED: './skills'`. Every local test passed, because
  locally `@beinfi/cli` resolves to the workspace copy and the import exists.
  The range is now explicit (`>=0.2.2 <0.3.0`).
- The smoke gate now asserts that the declared range **admits the workspace
  version it was tested against**, and rejects a caret on any first-party `0.x`
  range outright. Without that, a green local run says nothing about the published
  artifact — which is how both of these shipped.

## 0.1.2 — 2026-08-20

### Fixed
- **0.1.1 could not start.** The bundle shipped with TWO shebangs — one in
  `src/index.ts`, one from tsup's `banner` — so the published file was a syntax
  error and `npx -y @beinfi/mcp` failed with `SyntaxError: Invalid or unexpected
  token`. Our own docs tell people to run exactly that command. Nothing caught it
  because the package had no tests and nothing ever executed the built artifact.
  There is now a dependency-free `smoke` gate on `prepublishOnly` that starts the
  bundle and speaks an MCP `initialize` to it.

### Added
- **Skills as MCP resources**, for clients that read resources instead of files:
  `infi://skills` is the index, `infi://skills/{id}` each recipe as markdown. They
  come from `@beinfi/cli`, which already ships them, so there is exactly one copy
  and the CLI and MCP surfaces cannot drift.

