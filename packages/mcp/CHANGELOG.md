# Changelog

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

