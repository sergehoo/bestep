#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-}"
if [[ -z "$APP_URL" ]]; then
  echo "[ERROR] APP_URL is required. Example: APP_URL=https://app.example.com $0"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[ERROR] curl is required"
  exit 1
fi

TMP_HEADERS="$(mktemp)"
trap 'rm -f "$TMP_HEADERS"' EXIT

check_http_200() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$code" != "200" ]]; then
    echo "[FAIL] $url returned HTTP $code"
    exit 1
  fi
  echo "[OK] $url returned HTTP 200"
}

check_header_contains() {
  local header="$1"
  local expected="$2"
  if ! grep -i "^${header}:" "$TMP_HEADERS" | grep -qi "$expected"; then
    echo "[FAIL] Missing '${expected}' in ${header}"
    exit 1
  fi
  echo "[OK] ${header} contains '${expected}'"
}

check_header_not_contains() {
  local header="$1"
  local forbidden="$2"
  if grep -i "^${header}:" "$TMP_HEADERS" | grep -qi "$forbidden"; then
    echo "[FAIL] Found forbidden '${forbidden}' in ${header}"
    exit 1
  fi
  echo "[OK] ${header} does not contain '${forbidden}'"
}

echo "[INFO] Running smoke tests against $APP_URL"

check_http_200 "$APP_URL/healthz/"
check_http_200 "$APP_URL/readyz/"
check_http_200 "$APP_URL/"
check_http_200 "$APP_URL/account/login/"

curl -sS -D "$TMP_HEADERS" -o /dev/null "$APP_URL/"

check_header_contains "Content-Security-Policy" "script-src"
check_header_contains "Content-Security-Policy" "style-src"
check_header_contains "Content-Security-Policy" "frame-ancestors"
check_header_not_contains "Content-Security-Policy" "unsafe-inline"
check_header_not_contains "Content-Security-Policy" "unsafe-eval"

if grep -iq '^Referrer-Policy:' "$TMP_HEADERS"; then
  echo "[OK] Referrer-Policy present"
else
  echo "[WARN] Referrer-Policy missing"
fi

if grep -iq '^X-Content-Type-Options:.*nosniff' "$TMP_HEADERS"; then
  echo "[OK] X-Content-Type-Options nosniff present"
else
  echo "[WARN] X-Content-Type-Options nosniff missing"
fi

echo "[DONE] Smoke tests passed"
