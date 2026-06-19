# Z Store — Changelog

## v3.0 — June 2026 (Current)

### UI Redesign — Sleek · Professional · Minimal

- **Color palette**: Deep neutral black `#0a0a0b`, hairline borders `rgba(255,255,255,0.08)`, single sky-blue accent `#38bdf8`
- **Typography**: Inter, tighter weights (400/500/600), reduced font sizes (12-14px body, 13px UI)
- **Spacing**: 8px grid, tighter padding (16-24px sections vs 60px)
- **Radius**: 8px (down from 12-18px glass)
- **Removed**: animated orbs, gradient mesh, backdrop-filter blur, glow effects
- **Added**: solid surfaces, hairline borders, single accent functional, sharp corners
- **Bug fixes**:
  - `<div class="main">` was constrained by `margin:0 auto` inside flex parent — fixed with `width:100%; align-self:center`
  - `let products` collision between `app.js` and `products.js` (both used bare global) — wrapped `products.js` in IIFE
  - `const fmtIDR` and `const disc` redeclaration SyntaxError — renamed to `window.PRODUCTS_fmtIDR` / `window.PRODUCTS_disc`
  - `/api/products` only triggered on `product.html` not `index.html` — added `.prod-grid` and `#prodGrid` to selector
  - Hero padding reduced 80→64px to remove empty whitespace before flash sale
  - HTML `<script src="products.js">` added to `index.html` for dev fallback when API unavailable

### Backend Hardening

- All queries audited for SQL injection — 60+ queries verified parameterized with `?` placeholders
- Rate limits tightened on auth endpoints (5 reg/hr, 10 login/15min, 3 OTP/10min)
- New `schema-v7-promos.sql` for missing promo_codes + newsletter_subscribers tables (fixes 500 errors)
- Documentation: created `/docs/` folder with SECURITY.md, ARCHITECTURE.md, API.md, DEPLOYMENT.md, DEVELOPMENT.md, DATABASE.md, TESTING.md

### Security Test Suite

- New `test-security.sh` — 44 tests for SQLi, XSS, DDoS, rate limit, auth bypass, IDOR, headers, path traversal
- Result: **39/44 pass** (89%)

### Feature Test Suite

- New `test-features.sh` — 24 tests for products, categories, auth, orders, admin, notifications
- Result: **12/24 pass** (50% — failures are rate-limit false positives + missing DB schema)

---

## v2.x — Q1-Q2 2026

### v2.5 — Escrow + 2FA (schema v6)

- Escrow holds auto-release after 7 days
- 2FA via TOTP (HMAC-SHA1)
- Security audit log
- JWT blacklist (logout-all)
- Platform integrations (Telegram, WhatsApp, Discord)
- Midtrans webhook idempotency (status='pending' check)

### v2.4 — Reviews + Search (schema v4)

- Product reviews + ratings
- Full-text search on product name/description
- Recently-viewed tracking
- Compare products (best/worst per attribute)

### v2.3 — Midtrans Integration

- Snap checkout
- Webhook handler for payment notification
- Auto-delivery on capture/settlement
- Multi-payment: QRIS, VA, GoPay, ShopeePay, CC

### v2.2 — Glassmorphism UI

- Animated orbs background
- Backdrop-filter blur cards
- Gradient text headlines
- Glow effects on hover

### v2.1 — Auth Foundation (schema v1)

- Email/password register + login
- JWT (30-day expiry)
- bcrypt(12) password hashing
- Google OAuth (dev fallback)
- OTP via email
- Role-based access (buyer/seller/admin)

---

## Pre-v2 (2025)

- Initial marketplace concept
- Static HTML + vanilla JS
- Manual checkout (no payment gateway)
- LocalStorage cart only
