#!/usr/bin/env bash
# Smoke-test identity routes against a running Beinfi API (local dev).
# Prerequisites: postgres migrated, tenant created, keys bootstrapped.
set -euo pipefail

API="${INFI_API_URL:-http://localhost:8088}"
TENANT_SLUG="${INFI_APP_SLUG:-sdk-test}"
BACKEND_DIR="$(cd "$(dirname "$0")/../../backend" && pwd)"

if [[ -z "${INFI_SECRET_KEY:-}" || -z "${NEXT_PUBLIC_INFI_PK:-}" ]]; then
  echo "Bootstrapping keys for tenant $TENANT_SLUG..."
  eval "$(
    PULSE_DATABASE_URL="${PULSE_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/payments?sslmode=disable}" \
      go run "$BACKEND_DIR/scripts/bootstrap-keys" "$TENANT_SLUG"
  )"
  export INFI_SECRET_KEY NEXT_PUBLIC_INFI_PK INFI_APP_SLUG
fi

echo "=== POST /identity/magic-link (pk) ==="
curl -sf -X POST "$API/identity/magic-link" \
  -H "Authorization: Bearer $NEXT_PUBLIC_INFI_PK" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","redirectTo":"http://localhost:3009/callback","mode":"embedded"}'

echo ""
echo "=== GET /identity/apps/$TENANT_SLUG/login ==="
curl -sf -o /dev/null -w "HTTP %{http_code}\n" \
  "$API/identity/apps/$TENANT_SLUG/login?redirect_uri=http://localhost:3009/callback"

echo "Smoke OK (send + hosted login). Run API with devlog to capture tokens for validate/exchange."
