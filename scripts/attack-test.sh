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

echo "=== T1: SQLi in email field ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"sqli@test.com; DROP TABLE users;--","password":"TestPass123!"}')
check "SQLi email" "400" "$CODE"

echo "=== T2: XSS in name field ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"xss@test.com","password":"TestPass123!","name":"<script>alert(1)</script>"}')
check "XSS name" "400" "$CODE"

echo "=== T3: NoSQL injection ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":{"$ne":null},"password":{"$ne":null}}')
check "NoSQL injection" "400" "$CODE"

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
T1=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"definitelynotauser12345@nowhere.com","password":"TestPass123!"}')
T2=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@zcus.my.id","password":"TestPass123!"}')
echo "  non-existing user: ${T1}s   existing user: ${T2}s"
# Allow 50% variance (bcrypt adds noise; some variance is fine)
python3 -c "
import sys
a=float('$T1'); b=float('$T2')
diff=abs(a-b)/max(a,b)
if diff<0.5:
    print(f'  ✓ timing within 50% (diff {diff:.0%})')
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
check "SQLi in query" "400" "$CODE"

echo "=== T10: XSS in search ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/products?search=%3Cscript%3Ealert(1)%3C/script%3E")
check "XSS in search" "400" "$CODE"

echo
echo "==================================="
echo "  PASS: $PASS   FAIL: $FAIL"
echo "==================================="
[ "$FAIL" -eq 0 ]
