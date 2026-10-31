#!/usr/bin/env bash
# End-to-end smoke test.
set -euo pipefail

BACKEND="${1:-http://localhost:8000}"
FRONTEND="${2:-http://localhost:3000}"
EXPECTED_VERSION="${3:-}"

BACKEND="${BACKEND%/}"
FRONTEND="${FRONTEND%/}"

echo "-> health"
HEALTH_RESP=$(curl -s -f "$BACKEND/api/health")

if ! echo "$HEALTH_RESP" | grep -q '"db":"ok"'; then
  echo "Backend DB is not ok: $HEALTH_RESP" >&2
  exit 1
fi

if [ -n "$EXPECTED_VERSION" ]; then
  if ! echo "$HEALTH_RESP" | grep -q "\"version\":\"$EXPECTED_VERSION\""; then
    echo "Version mismatch, expected $EXPECTED_VERSION in: $HEALTH_RESP" >&2
    exit 1
  fi
fi

echo "-> frontend"
curl -s -f -o /dev/null "$FRONTEND/"

echo "-> login"
LOGIN_RESP=$(curl -s -f -X POST "$BACKEND/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"alice@phoenix.dev","password":"phoenix123"}')

if ! echo "$LOGIN_RESP" | grep -q '"access_token"'; then
  echo "Login failed to return access_token: $LOGIN_RESP" >&2
  exit 1
fi

echo "SMOKE OK"
