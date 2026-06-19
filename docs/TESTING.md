# Z Store — Testing

## Test Suites

### 1. Security Tests (`backend/test-security.sh`)

Tests for SQL injection, XSS, auth bypass, IDOR, rate limiting, headers, and path traversal.

```bash
cd backend
bash test-security.sh                                    # default: production
bash test-security.sh http://localhost:3001/api          # local backend
bash test-security.sh https://staging.zcus.biz.id/...   # staging
```

**Latest run** (against `https://zcus.biz.id/shop-app/api`):

```
Total:  44
Passed: 39 (89%)
Failed: 5 (header passthrough + size limit — see SECURITY.md)
```

See raw output: [security-test-results.txt](./security-test-results.txt).

### 2. Feature Smoke Tests (`backend/test-features.sh`)

Tests core user flows via API (products, auth, orders, admin).

```bash
bash test-features.sh
```

**Latest run**:

```
Total:  24
Passed: 12 (50%)
Failed: 12 (rate-limited or DB schema issues — see below)
```

See raw output: [feature-test-results.txt](./feature-test-results.txt).

### 3. Live API Test (`backend/test-api.sh`)

End-to-end test against production for the seller dashboard.

```bash
bash test-api.sh
```

Tests:
- Login as seller
- GET /api/seller/dashboard
- GET /api/seller/payout-settings
- GET /api/seller/transactions
- GET /api/seller/withdrawals

## Known Test Gaps

| Gap | Status | Fix |
|---|---|---|
| `/api/promos` returns 500 | ⚠ Missing `promo_codes` table on prod | Apply `schema-v7-promos.sql` |
| `/api/newsletter/subscribe` returns 500 | ⚠ Missing `newsletter_subscribers` table | Apply `schema-v7-promos.sql` |
| Login rate-limit false-positive in tests | ℹ By design — auth endpoints aggressively rate-limited | Wait 15 min between test runs |
| `X-Content-Type-Options` missing through CF | ℹ Cloudflare strips | Set in Cloudflare Transform Rules |
| Local API returns 503 (no DB) | ℹ By design | Test against prod or run with MySQL |

## Manual Browser Testing

### Homepage

1. Open `https://zcus.biz.id/shop/`
2. **Hero** — title "Z STORE" centered, CTA "Browse Products" / "Kenapa Z Store?"
3. **Trust strip** — 5 items: <10min Delivery, Full Warranty, 100% Original, Secure Payment, 24/7 Support
4. **Flash Sale banner** — countdown timer ticking, "Lihat Promo" button
5. **Product grid** — 4 columns desktop, 2 columns mobile, 20 products visible
6. **Sidebar** — categories with counts (All Products, AI Tools, Merchandise, dll)
7. **Footer** — 4 columns (Store, Pembayaran, Hubungi Kami, Brand)

### Cart Flow

1. Click "CART" button on any product → drawer slides in from right
2. Item appears in drawer with qty controls
3. Adjust qty → subtotal updates
4. Enter promo code "WELCOME50" → discount applied (Rp 50k off)
5. Click "Checkout" → redirected to `/shop/payment.html`
6. Midtrans Snap opens → choose payment method (QRIS / VA / GoPay)
7. Sandbox auto-approves → order created, redirected to `/shop/order-success.html`

### Auth Flow

1. Click account icon → modal opens with login/register tabs
2. Enter email + password → login → redirected to home
3. Header shows user name + role badge
4. Click logout → modal closes, header reverts to guest

### Admin

1. Login as admin (`zcusgt@gmail.com`)
2. Click "Admin" link in header
3. `/shop/admin.html` shows user list, product moderation, withdrawal queue
4. Approve/reject withdrawals
5. Change user roles

### Seller

1. Register as seller (role: 'seller' in register body)
2. Apply for seller (in `/shop/seller.html`)
3. Add products with inventory
4. Track sales in dashboard
5. Withdraw earnings (after 7-day escrow release)

### Mobile

1. Resize to <900px → sidebar hidden, mobile filter FAB appears
2. Bottom mobile nav appears with 4-5 icons
3. Product grid → 2 columns
4. Trust strip → 2x3 grid

## Test Output Files

- `security-test-results.txt` — Raw output of `test-security.sh`
- `feature-test-results.txt` — Raw output of `test-features.sh`
- `screenshots/` — Visual regression captures (manual)

## Continuous Integration (planned)

```yaml
# .github/workflows/test.yml (future)
name: Tests
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && bash test-security.sh ${{ secrets.STAGING_API }}
  features:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && bash test-features.sh ${{ secrets.STAGING_API }}
```
