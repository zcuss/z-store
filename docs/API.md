# Z Store — API Reference

Base URL: `https://zcus.biz.id/shop-app/api`

All endpoints return JSON. Authenticated endpoints require `Authorization: Bearer *** header.

## Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Not found |
| 409 | Conflict (duplicate email, etc.) |
| 413 | Payload too large (>512kb) |
| 429 | Rate limited |
| 500 | Server error (often missing DB schema) |

---

## Public

### Health

```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "node": "v20.18.1",
  "db": true,
  "tables": 23,
  "time": "2026-06-19T18:30:58.868Z"
}
```

### Products — List

```
GET /api/products?category=&search=&min=&max=&sort=&limit=&offset=
```

Query params:
- `category` — AI Tools | Merchandise | Digital Goods | Voucher | Jasa | Elektronik
- `search` — full-text on name/description
- `min`, `max` — price range (IDR)
- `sort` — `newest` | `price-asc` | `price-desc` | `discount` | `sold` | `rating`
- `limit` (default 50), `offset` (default 0)

Response: array of product objects (see below).

### Product — Get by ID

```
GET /api/products/:id
```

Response:
```json
{
  "id": 1,
  "name": "Claude Pro Annual License - AI Assistant",
  "category": "AI Tools",
  "price": 2400000,
  "original_price": 3000000,
  "discount_pct": 20,
  "stock": 12,
  "sold": 312,
  "rating": 4.9,
  "review_count": 47,
  "description": "...",
  "image_url": "...",
  "seller_id": 3,
  "created_at": "2026-01-15T...",
  "featured": true,
  "flash": false
}
```

### Product — Get by Slug

```
GET /api/products/slug/:slug
```

Slug = `slugify(name)`. Returns same shape as `:id`.

### Categories

```
GET /api/categories
```

### Promos (active codes)

```
GET /api/promos
```

Returns array of `{ code, type, value, min_order, max_uses, used_count, expires_at, label }`.

### Stats (live)

```
GET /api/stats/live
```

Returns `{ totalProducts, totalSold, totalBuyers, avgDeliveryMinutes }`.

### Spin Wheel

```
POST /api/spin-wheel
Body: {}
```

Returns `{ code, value, type, message }`.

### Newsletter Subscribe

```
POST /api/newsletter/subscribe
Body: { email: string, source?: string }
```

Returns `{ ok: true, message: '...' }`.

### Compare Products

```
POST /api/products/compare
Body: { ids: [1, 3, 5] }
```

Returns best/worst per attribute (price, rating, stock).

### Reviews — Get

```
GET /api/products/:id/reviews
```

Returns array of reviews.

### Product View Tracking

```
GET /api/products/:id/jsonld
```

Returns JSON-LD structured data for SEO.

---

## Auth

### Register

```
POST /api/auth/register
Body: { name, email, password, role?: 'buyer'|'seller' }
```

Rate limit: 5 / hour / IP.

Response: `{ user: {...}, token: 'JWT...' }`

### Login

```
POST /api/auth/login
Body: { email, password }
```

Rate limit: 10 / 15 min / IP.

Response: `{ user, token }`.

Failed login: 401 with `{ error: 'Invalid email or password' }`.

### Google OAuth

```
POST /api/auth/google
Body: { google_id, email, name, avatar_url? }
```

Creates or links Google account. Returns `{ user, token, isNew }`.

### OTP — Request

```
POST /api/auth/otp/request
Body: { email }
```

Rate limit: 3 / 10 min / IP. Sends 6-digit OTP to email.

### OTP — Verify

```
POST /api/auth/otp/verify
Body: { email, code }
```

Rate limit: 5 / 10 min / IP. Returns `{ user, token }`.

### Reset Password

```
POST /api/auth/reset-password
Body: { email, new_password }
```

### Get Current User

```
GET /api/auth/me
Auth: Bearer
```

### Logout (current device)

```
POST /api/auth/logout
```

### Logout All Devices

```
POST /api/auth/logout-all
Auth: Bearer
```

### Update Profile

```
PUT /api/auth/profile
Body: { name?, bio?, avatar_url?, phone? }
Auth: Bearer
```

### Change Password

```
PUT /api/auth/password
Body: { current_password, new_password }
Auth: Bearer
```

### Security Status

```
GET /api/auth/security-status
Auth: Bearer
```

Returns `{ totp_enabled, email_verified, last_login_at, last_login_ip }`.

### 2FA — Setup

```
POST /api/auth/2fa/setup
Auth: Bearer
```

Returns `{ secret, otpauth_url }` (user scans with Authenticator app).

### 2FA — Enable

```
POST /api/auth/2fa/enable
Body: { code, password }
Auth: Bearer
```

### 2FA — Disable

```
POST /api/auth/2fa/disable
Body: { password, code }
Auth: Bearer
```

### Email Verify — Request

```
POST /api/auth/email/verify/request
Auth: Bearer
```

Sends verification link.

### Email Verify — Confirm

```
GET /api/auth/email/verify?token=...
```

### Link Platform Account

```
POST /api/auth/link
Body: { platform, identifier }
Auth: Bearer
```

### Unlink Platform Account

```
POST /api/auth/unlink
Body: { platform }
Auth: Bearer
```

---

## Orders

### List My Orders

```
GET /api/orders/me
Auth: Bearer
```

### Get Order Detail

```
GET /api/orders/:id
Auth: Bearer
```

Returns order + items + delivery credentials.

### Checkout

```
POST /api/orders/checkout
Body: { items: [{product_id, qty}], promo_code?, address? }
Auth: Bearer
Rate limit: 10 / hour / IP
```

Response: `{ order_id, midtrans_token, midtrans_redirect_url, total }`.

### Confirm Delivery

```
POST /api/orders/:id/confirm-delivery
Auth: Bearer
```

Triggers escrow release.

### Midtrans Webhook (Notification)

```
POST /api/orders/notification
Body: <Midtrans payload>
```

Validates signature via `snap.transaction.notification()`. Auto-fulfills on `capture`/`settlement`.

### Invoice PDF/HTML

```
GET /api/orders/:id/invoice
Auth: Bearer
```

---

## Products — Seller/Admin CRUD

### Create Product

```
POST /api/products
Body: { name, category, price, original_price?, description, stock, image_url? }
Auth: Bearer
Role: seller | admin
```

### Update Product

```
PUT /api/products/:id
Body: <partial fields>
Auth: Bearer
Role: owner | admin
```

### Delete Product (archive)

```
DELETE /api/products/:id
Auth: Bearer
Role: owner | admin
```

### Add Inventory Items

```
POST /api/products/:id/inventory
Body: { items: [{mail, pass, two_fa?, tutorial?}] }
Auth: Bearer
Role: seller | admin
```

### Recently Viewed

```
GET /api/users/me/recently-viewed
DELETE /api/users/me/recently-viewed
Auth: Bearer
```

---

## Seller

### Withdraw

```
POST /api/seller/withdraw
Body: { amount, method, account_info }
Auth: Bearer
Role: seller
```

### Payout Settings

```
GET /api/seller/payout-settings
PUT /api/seller/payout-settings
Body: { method, account_name, account_number, bank_code? }
Auth: Bearer
Role: seller
```

---

## Admin

### Users — List

```
GET /api/admin/users
Auth: Bearer
Role: admin
```

### Users — Change Role

```
PUT /api/admin/users/:id/role
Body: { role: 'buyer'|'seller'|'admin' }
Auth: Bearer
Role: admin
```

### Users — Delete

```
DELETE /api/admin/users/:id
Auth: Bearer
Role: admin
```

### Withdrawals — Approve

```
POST /api/admin/withdrawals/:id/approve
Auth: Bearer
Role: admin
```

### Withdrawals — Reject

```
POST /api/admin/withdrawals/:id/reject
Body: { reason }
Auth: Bearer
Role: admin
```

---

## Notifications

```
GET /api/notifications
Auth: Bearer
```

---

## Wishlist (Public Share)

```
GET /api/wishlist/share/:code
```

Public, returns shared wishlist by code.
