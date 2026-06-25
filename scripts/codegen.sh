#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OPENAPI="${ROOT}/../backend/api/openapi.yaml"
OUT="${ROOT}/packages/sdk/src/generated/openapi.ts"

if [[ ! -f "$OPENAPI" ]]; then
  echo "OpenAPI spec not found at $OPENAPI" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
bunx openapi-typescript "$OPENAPI" -o "$OUT"
echo "Generated $OUT"
