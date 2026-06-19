#!/bin/bash
# Test API endpoints

LOGIN=$(curl -s -X POST "https://zcus.biz.id/shop-app/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"zcusgt@gmail.com","password":"test123456"}')

echo "=== LOGIN ==="
echo "$LOGIN" | head -c 200
echo

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "Login failed"
  exit 1
fi

echo
echo "=== /api/seller/dashboard ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://zcus.biz.id/shop-app/api/seller/dashboard" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('stats:', json.dumps(d.get('stats'), indent=2))
print('balance:', json.dumps(d.get('balance'), indent=2))
print('fees count:', len(d.get('fees', [])))
print('escrowHolds count:', len(d.get('escrowHolds', [])))
print('recentTxns count:', len(d.get('recentTxns', [])))
print('topProducts count:', len(d.get('topProducts', [])))
"

echo
echo "=== /api/seller/payout-settings ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://zcus.biz.id/shop-app/api/seller/payout-settings"
echo

echo
echo "=== /api/seller/transactions ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://zcus.biz.id/shop-app/api/seller/transactions" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('count:', len(d) if isinstance(d, list) else d)
"

echo
echo "=== /api/seller/withdrawals ==="
curl -s -H "Authorization: Bearer $TOKEN" "https://zcus.biz.id/shop-app/api/seller/withdrawals" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('count:', len(d) if isinstance(d, list) else d)
"

echo
echo "=== POST /api/seller/withdraw (Rp 50000) ==="
curl -s -X POST "https://zcus.biz.id/shop-app/api/seller/withdraw" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount":50000,"method":"bank_transfer","destination":"1234567890","destination_name":"Zcus Test","bank_code":"BCA"}'
