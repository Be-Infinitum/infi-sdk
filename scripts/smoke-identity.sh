#!/usr/bin/env bash
# Smoke-test identity routes against a running Beinfi API (local dev).
# Prerequisites: postgres migrated, tenant created, keys bootstrapped.
set -euo pipefail

API="${INFI_API_URL:-http://localhost:8088}"
TENANT_SLUG="${INFI_APP_SLUG:-sdk-test}"
BACKEND_DIR="$(cd "$(dirname "$0")/../../backend" && pwd)"

if [[ -z "${INFI_SECRET_KEY:-}" ]]; then
  echo "Bootstrapping keys for tenant $TENANT_SLUG..."
  eval "$(
    PULSE_DATABASE_URL="${PULSE_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/payments?sslmode=disable}" \
      go run "$BACKEND_DIR/scripts/bootstrap-keys" "$TENANT_SLUG"
  )"
  export INFI_SECRET_KEY INFI_APP_SLUG
fi

echo "=== POST /identity/apps/$TENANT_SLUG/email-code (public) ==="
curl -sf -o /dev/null -w "HTTP %{http_code}\n" -X POST \
  "$API/identity/apps/$TENANT_SLUG/email-code" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","redirectTo":"http://localhost:3009/callback"}'

echo "=== GET /identity/apps/$TENANT_SLUG/config (public) ==="
curl -sf "$API/identity/apps/$TENANT_SLUG/config"
echo ""

echo "=== GET /identity/apps/$TENANT_SLUG/login ==="
curl -sf -o /dev/null -w "HTTP %{http_code}\n" \
  "$API/identity/apps/$TENANT_SLUG/login?redirect_uri=http://localhost:3009/callback"

echo "Smoke OK (send + config + hosted login). Run API with devlog to capture the code for verify/exchange."
