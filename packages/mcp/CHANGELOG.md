# Changelog

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

