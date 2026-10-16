#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# OPENAPI overrides the default sibling checkout, e.g. a spec read out of git:
#   git -C ../backend show origin/develop:backend/api/openapi.yaml > /tmp/openapi.yaml
#   OPENAPI=/tmp/openapi.yaml bun run codegen
OPENAPI="${OPENAPI:-${ROOT}/../backend/api/openapi.yaml}"
OUT="${ROOT}/packages/sdk/src/generated/openapi.ts"

if [[ ! -f "$OPENAPI" ]]; then
  echo "OpenAPI spec not found at $OPENAPI (set OPENAPI=/path/to/openapi.yaml)" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
bunx openapi-typescript "$OPENAPI" -o "$OUT"
echo "Generated $OUT"
