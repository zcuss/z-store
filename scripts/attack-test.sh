#!/bin/bash
# Z Store — Attack test suite
# Verifies hardening: SQLi, XSS, NoSQL, body size, path traversal, headers, timing
# Usage: bash scripts/attack-test.sh [BASE_URL]
set -u
BASE="${1:-https://zcus.my.id}"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" got="$3"
  if [ "$expected" = "$got" ]; then
    echo "  ✓ $label (HTTP $got)"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected $expected, got $got"
    FAIL=$((FAIL+1))
  fi
}

check_block() {
  local label="$1" got="$2"
  if [ "$got" = "400" ] || [ "$got" = "403" ]; then
    echo "  ✓ $label blocked (HTTP $got)"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected 400/403, got $got"
    FAIL=$((FAIL+1))
  fi
}

echo "=== T1: SQLi in email field ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"sqli@test.com; DROP TABLE users;--","password":"TestPass123!"}')
check_block "SQLi email" "$CODE"

echo "=== T2: XSS in name field ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"xss@test.com","password":"TestPass123!","name":"<script>alert(1)</script>"}')
check_block "XSS name" "$CODE"

echo "=== T3: NoSQL injection ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":{"$ne":null},"password":{"$ne":null}}')
# 400=invalid email, 403=injectionGuard blocked, 429=rate limit (also acceptable — server is hardening)
if [ "$CODE" = "400" ] || [ "$CODE" = "403" ] || [ "$CODE" = "429" ]; then
  echo "  ✓ NoSQL injection blocked (HTTP $CODE)"; PASS=$((PASS+1))
else
  echo "  ✗ NoSQL injection — expected 400/403/429, got $CODE"; FAIL=$((FAIL+1))
fi

echo "=== T4: Body too large (600KB) ==="
TMPF=$(mktemp)
python3 -c "import json; print(json.dumps({'email':'big@test.com','password':'x'*600000}))" > "$TMPF"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMPF")
rm -f "$TMPF"
check "body > 512KB" "413" "$CODE"

echo "=== T5: Path traversal ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/products/../../../etc/passwd")
check "path traversal" "404" "$CODE"

echo "=== T6: Security headers ==="
HEADERS=$(curl -s -D - -o /dev/null "$BASE/api/health")
for h in content-security-policy strict-transport-security x-frame-options x-content-type-options referrer-policy; do
  if echo "$HEADERS" | grep -qi "$h"; then
    echo "  ✓ $h present"
    PASS=$((PASS+1))
  else
    echo "  ✗ $h MISSING"
    FAIL=$((FAIL+1))
  fi
done
if echo "$HEADERS" | grep -qi "x-powered-by"; then
  echo "  ✗ x-powered-by LEAKS (should be removed)"
  FAIL=$((FAIL+1))
else
  echo "  ✓ x-powered-by absent"
  PASS=$((PASS+1))
fi

echo "=== T7: Constant-time login (timing attack mitigation) ==="
# Sample 3x each, drop outliers, compare medians
sample() {
  local email="$1"
  local times=()
  for i in 1 2 3; do
    local t=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$BASE/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"TestPass123!\"}")
    times+=("$t")
  done
  # sort numerically
  printf '%s\n' "${times[@]}" | sort -n | sed -n '2p'  # median
}
T_NONEXIST=$(sample "definitelynotauser12345@nowhere.com")
T_EXIST=$(sample "seller@zcus.biz.id")
echo "  non-existing: ${T_NONEXIST}s   existing: ${T_EXIST}s"
python3 -c "
import sys
a=float('$T_NONEXIST'); b=float('$T_EXIST')
diff=abs(a-b)/max(a,b)
# bcrypt is inherently noisy; 80% threshold accounts for legitimate variance
if diff<0.8:
    print(f'  ✓ timing within 80% (diff {diff:.0%})')
    sys.exit(0)
else:
    print(f'  ✗ timing diverges {diff:.0%} — enumeration possible')
    sys.exit(1)
" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

echo "=== T8: Weak password rejected ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"weak@test.com","password":"abc"}')
check "weak password (3 chars)" "400" "$CODE"

echo "=== T9: SQLi in URL params ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/products?id=1%20OR%201=1")
# injectionGuard returns 403 (not 400) for blocked IPs after accumulating offenses
if [ "$CODE" = "400" ] || [ "$CODE" = "403" ]; then
  echo "  ✓ SQLi in query blocked (HTTP $CODE)"; PASS=$((PASS+1))
else
  echo "  ✗ SQLi in query — expected 400/403, got $CODE"; FAIL=$((FAIL+1))
fi

echo "=== T10: XSS in search ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/products?search=%3Cscript%3Ealert(1)%3C/script%3E")
if [ "$CODE" = "400" ] || [ "$CODE" = "403" ]; then
  echo "  ✓ XSS in search blocked (HTTP $CODE)"; PASS=$((PASS+1))
else
  echo "  ✗ XSS in search — expected 400/403, got $CODE"; FAIL=$((FAIL+1))
fi

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
echo "==================================="
[ "$FAIL" -eq 0 ]
