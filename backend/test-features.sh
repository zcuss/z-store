#!/bin/bash
# ============================================================
# Z Store — Feature Smoke Test (1-by-1)
# ============================================================

set -u
BASE="${1:-https://zcus.biz.id/shop-app/api}"
PASS=0
FAIL=0
TOTAL=0
G="\033[92m"; R="\033[91m"; Y="\033[93m"; B="\033[94m"; D="\033[0m"

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

run() {
  local name="$1" expect="$2" got="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$expect" == "$got" ]]; then
    PASS=$((PASS + 1)); echo -e "${G}OK${D} $name -> $got"
  else
    FAIL=$((FAIL + 1)); echo -e "${R}FAIL${D} $name -> $got (expected $expect)"
  fi
}

get_json() {
  cat "$TMP/body" | jq -r "$1" 2>/dev/null
}

hit() {
  local m="$1" u="$2" d="${3:-}" h="${4:-}"
  if [[ -n "$d" ]]; then
    curl -sS -o "$TMP/body" -w "%{http_code}" -X "$m" "$u" \
      -H "Content-Type: application/json" ${h:+-H "$h"} --data-raw "$d" 2>/dev/null
  else
    curl -sS -o "$TMP/body" -w "%{http_code}" -X "$m" "$u" ${h:+-H "$h"} 2>/dev/null
  fi
}

echo -e "${B}============================================================${D}"
echo -e "${B}  Z Store Feature Smoke Tests${D}"
echo -e "${B}  Target: $BASE${D}"
echo -e "${B}============================================================${D}"

# ============== PUBLIC PRODUCTS ==============
echo -e "\n${Y}[1] PUBLIC PRODUCTS${D}"
s=$(hit GET "$BASE/products?limit=5"); run "GET /products" "200" "$s"
s=$(hit GET "$BASE/products/1"); run "GET /products/1" "200" "$s"
s=$(hit GET "$BASE/categories"); run "GET /categories" "200" "$s"
s=$(hit GET "$BASE/products?search=claude"); run "Search claude" "200" "$s"
s=$(hit GET "$BASE/products?category=AI%20Tools&sort=price-asc"); run "Filter+sort" "200" "$s"
s=$(hit GET "$BASE/products?min=100000&max=500000"); run "Price range" "200" "$s"
s=$(hit GET "$BASE/stats/live"); run "GET /stats/live" "200" "$s"
s=$(hit GET "$BASE/products/1/reviews"); run "GET reviews" "200" "$s"
s=$(hit POST "$BASE/spin-wheel" "{}"); run "POST /spin-wheel" "200" "$s"

NL_EMAIL="nl_$(date +%s%N)@x.com"
s=$(hit POST "$BASE/newsletter/subscribe" "{\"email\":\"$NL_EMAIL\"}"); run "POST /newsletter" "200" "$s"

# ============== AUTH ==============
echo -e "\n${Y}[2] AUTH${D}"
EMAIL="test_$(date +%s)_$$@zstore.test"
PASSW="TestPass123!"

s=$(hit POST "$BASE/auth/register" "{\"name\":\"Test\",\"email\":\"$EMAIL\",\"password\":\"$PASSW\"}"); run "POST /auth/register" "200" "$s"
TOKEN=$(get_json '.token')

s=$(hit POST "$BASE/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSW\"}"); run "POST /auth/login" "200" "$s"
TOKEN=$(get_json '.token')

s=$(hit POST "$BASE/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"WRONG\"}"); run "Login wrong pass" "401" "$s"

AUTH="Authorization: Bearer ${TOKEN}"
s=$(hit GET "$BASE/auth/me" "" "$AUTH"); run "GET /auth/me" "200" "$s"
s=$(hit GET "$BASE/auth/security-status" "" "$AUTH"); run "GET /auth/security-status" "200" "$s"
s=$(hit POST "$BASE/auth/google" "{\"google_id\":\"g_test_$(date +%s)\",\"email\":\"google_$(date +%s)@g.com\",\"name\":\"Google User\"}"); run "POST /auth/google" "200" "$s"

s=$(hit GET "$BASE/auth/me" "" "Authorization: Bearer bad.token.here"); run "GET /auth/me bad token" "401" "$s"

# ============== AUTHED ==============
echo -e "\n${Y}[3] AUTHED ENDPOINTS${D}"
s=$(hit GET "$BASE/orders/me" "" "$AUTH"); run "GET /orders/me" "200" "$s"
s=$(hit GET "$BASE/orders/99999" "" "$AUTH"); run "GET /orders/99999 IDOR" "403" "404" "401" # at least not 200

s=$(hit GET "$BASE/wishlist/share/INVALID-CODE"); run "GET /wishlist/share/invalid" "404" "$s"
s=$(hit GET "$BASE/notifications" "" "$AUTH"); run "GET /notifications" "200" "$s"

# ============== ADMIN (role) ==============
echo -e "\n${Y}[4] ADMIN ROLE${D}"
s=$(hit GET "$BASE/admin/users" "" "$AUTH"); run "GET /admin/users as buyer" "403" "401"
s=$(hit GET "$BASE/admin/withdrawals" "" "$AUTH"); run "GET /admin/withdrawals" "403" "401"
s=$(hit GET "$BASE/admin/users" ""); run "GET /admin/users guest" "401" "$s"

# ============== SUMMARY ==============
echo ""
echo -e "${B}============================================================${D}"
echo -e "${B}  Summary${D}"
echo -e "${B}============================================================${D}"
echo -e "Total:  $TOTAL"
echo -e "${G}Passed: $PASS${D}"
echo -e "${R}Failed: $FAIL${D}"
echo ""
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
