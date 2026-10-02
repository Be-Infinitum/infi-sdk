#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# api/openapi.json is the backend contract without its internal routes, pushed
# here by the Infi monorepo (infi-docs/scripts/sdk-openapi.mjs) whenever it
# changes. Never edit it by hand: the next sync overwrites it.
OPENAPI="${OPENAPI:-${ROOT}/api/openapi.json}"
OUT="${ROOT}/packages/sdk/src/generated/openapi.ts"

if [[ ! -f "$OPENAPI" ]]; then
  echo "OpenAPI spec not found at $OPENAPI" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
bunx openapi-typescript "$OPENAPI" -o "$OUT"
echo "Generated $OUT"
