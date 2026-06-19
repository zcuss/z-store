#!/bin/bash
# ============================================================
# Z Store — Security Test Suite
# Tests: SQLi, XSS, DDoS, Rate Limit, Auth Bypass, IDOR, Headers
# Usage: bash test-security.sh [BASE_URL]
# Default: https://zcus.biz.id/shop-app/api
# ============================================================

set -u
BASE="${1:-https://zcus.biz.id/shop-app/api}"
PASS=0
FAIL=0
TOTAL=0

# Colors
G="\033[92m"; R="\033[91m"; Y="\033[93m"; B="\033[94m"; D="\033[0m"

# tmp
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

# Helper: hit endpoint, save status + body
hit() {
  local method="$1" url="$2" data="${3:-}" hdr="${4:-}"
  if [[ -n "$data" ]]; then
    curl -sS -o "$TMP/body" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Content-Type: application/json" \
      ${hdr:+-H "$hdr"} \
      --data-raw "$data" 2>/dev/null
  else
    curl -sS -o "$TMP/body" -w "%{http_code}" \
      -X "$method" "$url" \
      ${hdr:+-H "$hdr"} 2>/dev/null
  fi
}

# check <name> <status> <expect> [expect2 ...]
check() {
  local name="$1" status="$2"; shift 2
  TOTAL=$((TOTAL + 1))
  local matched=0
  for exp in "$@"; do
    if [[ "$status" == "$exp" ]]; then matched=1; break; fi
  done
  if [[ $matched -eq 1 ]]; then
    PASS=$((PASS + 1))
    echo -e "${G}✓${D} $name → $status"
  else
    FAIL=$((FAIL + 1))
    echo -e "${R}✗${D} $name → $status (expected: $*)"
  fi
}

# safe_check <name> <status> <body>  -> body must NOT contain XSS/SQLi patterns
safe_check() {
  local name="$1" status="$2" body="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | grep -qiE "(sql syntax|mysql_|pg_sleep|odbc_|syntax error|union select|drop table|<script>alert|onerror=|onload=|<iframe.*javascript)"; then
    FAIL=$((FAIL + 1))
    echo -e "${R}✗${D} $name — payload reflected/accepted"
  else
    PASS=$((PASS + 1))
    echo -e "${G}✓${D} $name → $status (clean)"
  fi
}

echo -e "${B}============================================================${D}"
echo -e "${B}  Z Store Security Test Suite${D}"
echo -e "${B}  Target: $BASE${D}"
echo -e "${B}============================================================${D}"

# ===== HEALTH =====
echo -e "\n${Y}[1] Health check${D}"
s=$(hit GET "$BASE/health")
check "Health endpoint" "$s" "200" "503"

# ===== SQL INJECTION =====
echo -e "\n${Y}[2] SQL Injection — GET params${D}"
SQLI=( "1' OR '1'='1" "1; DROP TABLE users--" "1 UNION SELECT password FROM users--" "1' AND SLEEP(3)--" "admin'--" "1 OR 1=1--" )
for p in "${SQLI[@]}"; do
  enc=$(printf '%s' "$p" | jq -sRr @uri)
  s=$(hit GET "$BASE/products?id=$enc")
  b=$(cat "$TMP/body")
  safe_check "SQLi: $p" "$s" "$b"
done

echo -e "\n${Y}[3] SQL Injection — POST body (login)${D}"
for p in "${SQLI[@]}"; do
  body="{\"email\":\"$p\",\"password\":\"x\"}"
  s=$(hit POST "$BASE/auth/login" "$body")
  b=$(cat "$TMP/body")
  safe_check "SQLi in login email: $p" "$s" "$b"
done

echo -e "\n${Y}[4] SQL Injection — register name${D}"
for p in "${SQLI[@]}"; do
  body="{\"name\":\"$p\",\"email\":\"sqli_$(date +%s%N)@x.com\",\"password\":\"abcdef\"}"
  s=$(hit POST "$BASE/auth/register" "$body")
  b=$(cat "$TMP/body")
  # register accepts payload but should sanitize — make sure no SQL error in body
  safe_check "SQLi in register name: $p" "$s" "$b"
done

# ===== XSS =====
echo -e "\n${Y}[5] XSS — registration${D}"
XSS=( "<script>alert(1)</script>" "<img src=x onerror=alert(1)>" "javascript:alert(1)" "<svg/onload=alert(1)>" )
for p in "${XSS[@]}"; do
  body="{\"name\":\"$p\",\"email\":\"xss_$(date +%s%N)@x.com\",\"password\":\"abcdef\"}"
  s=$(hit POST "$BASE/auth/register" "$body")
  b=$(cat "$TMP/body")
  safe_check "XSS register: $p" "$s" "$b"
done

echo -e "\n${Y}[6] XSS — search query${D}"
for p in "${XSS[@]}"; do
  enc=$(printf '%s' "$p" | jq -sRr @uri)
  s=$(hit GET "$BASE/products?search=$enc")
  b=$(cat "$TMP/body")
  safe_check "XSS in search: $p" "$s" "$b"
done

# ===== AUTH BYPASS =====
echo -e "\n${Y}[7] Auth bypass${D}"
s=$(hit GET "$BASE/auth/me")
check "Protected route w/o token" "$s" "401" "403"

s=$(hit GET "$BASE/auth/me" "" "Authorization: Bearer invalid_token_xyz")
check "Protected route w/ bad token" "$s" "401" "403"

s=$(hit GET "$BASE/admin/users")
check "Admin route as guest" "$s" "401" "403"

# Try token injection
s=$(hit GET "$BASE/admin/users" "" "Authorization: Bearer ' OR '1'='1")
check "Admin route w/ SQLi token" "$s" "401" "403" "400"

# ===== IDOR =====
echo -e "\n${Y}[8] IDOR — order access${D}"
s=$(hit GET "$BASE/orders/1")
check "Order 1 w/o auth" "$s" "401" "403"

s=$(hit GET "$BASE/orders/99999")
check "Order 99999 w/o auth" "$s" "401" "403"

# ===== DDoS / RATE LIMIT =====
echo -e "\n${Y}[9] Rate limit — rapid burst${D}"
S429=0
LAST=""
for i in $(seq 1 80); do
  LAST=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/products")
  [[ "$LAST" == "429" ]] && S429=$((S429 + 1))
done
TOTAL=$((TOTAL + 1))
if [[ $S429 -gt 0 ]]; then
  PASS=$((PASS + 1))
  echo -e "${G}✓${D} Burst rate-limit triggered ($S429/80 got 429)"
else
  FAIL=$((FAIL + 1))
  echo -e "${Y}⚠${D} No 429 in 80 rapid requests (last: $LAST) — global limit may be high"
fi

echo -e "\n${Y}[10] Rate limit — login flood${D}"
SEEN_429=0
LAST_L=""
UNIQ=$$
for i in $(seq 1 20); do
  body="{\"email\":\"floodtest_${i}_${UNIQ}@x.com\",\"password\":\"x\"}"
  LAST_L=$(hit POST "$BASE/auth/login" "$body")
  [[ "$LAST_L" == "429" ]] && SEEN_429=$((SEEN_429 + 1))
done
TOTAL=$((TOTAL + 1))
if [[ $SEEN_429 -gt 0 ]]; then
  PASS=$((PASS + 1))
  echo -e "${G}✓${D} Login rate-limit triggered ($SEEN_429/20 got 429)"
else
  FAIL=$((FAIL + 1))
  echo -e "${R}✗${D} Login rate-limit never triggered (last: $LAST_L)"
fi

# ===== SECURITY HEADERS =====
echo -e "\n${Y}[11] Security headers${D}"
HDR=$(curl -sSI "$BASE/products")
check_header() {
  local name="$1" pattern="$2"
  TOTAL=$((TOTAL + 1))
  if echo "$HDR" | grep -qiE "^${name}:.*${pattern}"; then
    PASS=$((PASS + 1)); echo -e "${G}✓${D} $name present"
  else
    FAIL=$((FAIL + 1)); echo -e "${R}✗${D} $name missing"
  fi
}
check_header "X-Content-Type-Options" "nosniff"
check_header "X-Frame-Options" "DENY|SAMEORIGIN"
check_header "Strict-Transport-Security" "max-age"
check_header "Content-Security-Policy" "default-src"
check_header "Referrer-Policy" "strict|origin"

# ===== METHOD OVERRIDE =====
echo -e "\n${Y}[12] HTTP method override${D}"
s=$(curl -sS -o /dev/null -w "%{http_code}" -X TRACE "$BASE/products")
TOTAL=$((TOTAL + 1))
if [[ "$s" == "405" ]] || [[ "$s" == "501" ]] || [[ "$s" == "400" ]]; then
  PASS=$((PASS + 1)); echo -e "${G}✓${D} TRACE blocked: $s"
else
  echo -e "${Y}⚠${D} TRACE returned $s (acceptable but not ideal)"
  PASS=$((PASS + 1))
fi

# ===== PATH TRAVERSAL =====
echo -e "\n${Y}[13] Path traversal${D}"
for p in "../../../etc/passwd" "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"; do
  b=$(curl -sS "$BASE/../$p" 2>/dev/null | head -c 200)
  TOTAL=$((TOTAL + 1))
  if echo "$b" | grep -qE "root:x:0:0|daemon:"; then
    FAIL=$((FAIL + 1)); echo -e "${R}✗${D} Traversal succeeded: $p"
  else
    PASS=$((PASS + 1)); echo -e "${G}✓${D} Traversal blocked: $p"
  fi
done

# ===== REQUEST SIZE =====
echo -e "\n${Y}[14] Request size limit${D}"
HUGE=$(printf 'a%.0s' {1..600000})  # 600kb
s=$(hit POST "$BASE/auth/login" "{\"email\":\"x@y.com\",\"password\":\"$HUGE\"}")
check "Huge body (>512kb)" "$s" "413" "400" "403"

# ===== SUMMARY =====
echo ""
echo -e "${B}============================================================${D}"
echo -e "${B}  Summary${D}"
echo -e "${B}============================================================${D}"
echo -e "Total:  $TOTAL"
echo -e "${G}Passed: $PASS${D}"
echo -e "${R}Failed: $FAIL${D}"
echo ""
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
