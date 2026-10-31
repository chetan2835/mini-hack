#!/usr/bin/env bash
set -euo pipefail

URL="${1:?URL required}"
TIMEOUT="${2:-30}"

echo "Waiting for $URL to be ready (timeout ${TIMEOUT}s)..."
for ((i=1; i<=TIMEOUT; i++)); do
  if curl -s -f -o /dev/null "$URL"; then
    echo "$URL is ready!"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for $URL" >&2
exit 1

