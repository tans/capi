#!/usr/bin/env sh
set -eu
BASE="${1:-http://127.0.0.1:3210}"
EMAIL="${2:-smoke@example.com}"
PASSWORD="${3:-smoke-password-123}"
COOKIE=$(mktemp "${TMPDIR:-/tmp}/capi-smoke-cookie.XXXXXX")
trap 'rm "$COOKIE"' EXIT HUP INT TERM

curl --noproxy localhost,127.0.0.1 -fsS "$BASE/api/healthz" >/dev/null
curl --noproxy localhost,127.0.0.1 -fsS "$BASE/api/readyz" >/dev/null
curl --noproxy localhost,127.0.0.1 -sS -o /dev/null -w '%{http_code}' -c "$COOKIE" -H 'Content-Type: application/json' -X POST "$BASE/api/auth/register" -d "{\"name\":\"Smoke\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | grep -Eq '^(201|409)$'
curl --noproxy localhost,127.0.0.1 -fsS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' -X POST "$BASE/api/auth/login" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
curl --noproxy localhost,127.0.0.1 -fsS -b "$COOKIE" "$BASE/api/workspaces" >/dev/null
printf 'CAPI smoke passed
'
