#!/usr/bin/env sh
set -eu
BASE="${CAPI_SMOKE_BASE_URL:-http://127.0.0.1:3210}"
EMAIL="${CAPI_SMOKE_EMAIL:-smoke@example.com}"
PASSWORD="${CAPI_SMOKE_PASSWORD:-smoke-password-123}"
COOKIE="${TMPDIR:-/tmp}/capi-smoke-cookie.txt"
rm -f "$COOKIE"

curl -fsS "$BASE/api/healthz" >/dev/null
curl -fsS "$BASE/api/readyz" >/dev/null
curl -sS -o /dev/null -w '%{http_code}' -c "$COOKIE" -H 'Content-Type: application/json' -X POST "$BASE/api/auth/register" -d "{"name":"Smoke","email":"$EMAIL","password":"$PASSWORD"}" | grep -Eq '201|409'
curl -fsS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' -X POST "$BASE/api/auth/login" -d "{"email":"$EMAIL","password":"$PASSWORD"}" >/dev/null
curl -fsS -b "$COOKIE" "$BASE/api/workspaces" >/dev/null
printf 'CAPI smoke passed
'
