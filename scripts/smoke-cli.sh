#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.bun/bin:${PATH}"

cd "$ROOT"

echo "== build =="
bun run build

echo "== @beinfi/cli help =="
node packages/cli/dist/index.js --help | head -5

echo "== create-infi-app scaffold =="
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

node "$ROOT/packages/create-infi-app/dist/index.js" smoke-app -y \
  --skip-provision --skip-install --skip-setup

test -f smoke-app/infi.billing.ts
test -f smoke-app/package.json
grep -q '"plan"' smoke-app/package.json

echo "== smoke ok =="
