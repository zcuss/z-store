# Z Store — Architecture

## High-Level Overview

```
                  ┌──────────────────────────┐
                  │  Cloudflare (CDN + WAF)  │
                  │  zcus.biz.id / *.trycloudflare
                  └────────────┬─────────────┘
                               │ HTTPS + Tunnel
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼─────┐         ┌──────▼──────┐       ┌──────▼──────┐
   │ cPanel   │         │  VPS2       │       │  VPS1       │
   │ shared   │         │  47.236.    │       │  local dev  │
   │ hosting  │         │  149.190    │       │  this host  │
   │          │         │             │       │             │
   │ /shop/   │◄────────┤  Node 22    │       │  Node 22    │
   │ static   │ tunnel  │  Express    │       │  Express    │
   │ HTML+JS  │ reverse │  :3001      │       │  :3001      │
   │          │ proxy   │  PM2 z-store│       │  (dev only) │
   └──────────┘         │  nginx:443  │       └─────────────┘
                        └──────┬──────┘
                               │ MySQL over Tailscale
                        ┌──────▼──────┐
                        │  VPS4       │
                        │  8.215.     │
                        │  192.96     │
                        │             │
                        │  MySQL 8    │
                        │  zcuss_zshop│
                        │  23 tables  │
                        └─────────────┘
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Static HTML + vanilla JS + CSS (no build step) |
| Font | Inter (system fallback) |
| Icons | Font Awesome 6 |
| Payment | Midtrans Snap (sandbox for dev) |
| Backend | Node.js 22 + Express 4 + mysql2/promise |
| Database | MySQL 8 (InnoDB, utf8mb4) |
| Auth | JWT (30d expiry) + bcrypt (12 rounds) + TOTP 2FA optional |
| Process | PM2 (z-store) |
| Reverse proxy | nginx + Cloudflare Tunnel |
| CDN/WAF | Cloudflare (free tier + trycloudflare dev tunnels) |
| VPN | Tailscale (zcus2=100.116.141.100) |

## Request Lifecycle — Example

**Buyer browses products:**

1. Browser → `GET https://zcus.biz.id/shop/`
2. Cloudflare → tunnel → VPS2 nginx → Express static → returns `index.html`
3. Browser executes inline `<script src="app.js">`
4. `app.js → DOMContentLoaded → loadProducts()`
5. `loadProducts() → fetch(API + '/products')`
6. Cloudflare → VPS2 nginx → Express
7. Express middleware chain: `globalRateLimit → corsStrict → securityHeaders → json(body) → urlencoded → requestGuard → injectionGuard`
8. Route handler `app.get('/api/products', ...)`
9. Handler: validates query, queries MySQL via `pool.query('SELECT ... FROM products WHERE ...', [params])`
10. Returns JSON → Express → nginx → Cloudflare → browser
11. `app.js → renderProducts(json) → DOM update`

## Directory Layout

```
/root/z-store/
├── backend/
│   ├── server.js              # Express app + 93 routes (1786 LOC)
│   ├── security.js            # CSP, CORS, rate-limit, injection guard (299 LOC)
│   ├── schema.sql             # v1 schema
│   ├── schema-v4.sql          # reviews, search
│   ├── schema-v5.sql          # escrow, seller balance, withdrawals
│   ├── schema-v6-security.sql # 2FA, audit logs
│   ├── schema-v7-promos.sql   # promo codes + newsletter (NEW)
│   ├── seed.sql               # sample products + admin user
│   ├── test-security.sh       # SQLi/XSS/DDoS suite
│   ├── test-features.sh       # Feature smoke test
│   ├── test-api.sh            # End-to-end API test (live)
│   └── start.sh               # PM2 launcher
├── frontend/
│   └── shop/
│       ├── index.html         # Home (4-col product grid)
│       ├── product.html       # Product detail
│       ├── payment.html       # Midtrans checkout
│       ├── order-success.html
│       ├── orders.html        # Order history
│       ├── admin.html         # Admin moderation
│       ├── seller.html        # Seller dashboard
│       ├── settings.html      # User settings + 2FA
│       ├── notifications.html
│       ├── support.html
│       ├── faq.html
│       ├── about.html
│       ├── 404.html
│       ├── auth/              # login.html, register.html, otp.html
│       ├── styles.css         # 1500 LOC, sleek dark theme
│       ├── app.js             # 1000 LOC, frontend logic
│       ├── products.js        # 20-item fallback catalog (IIFE)
│       └── manifest.json      # PWA
├── docs/                      # This folder
├── README.md                  # Top-level project README
└── scripts/                   # Deploy helpers (push.sh, sync_push.py)
```

## Key Design Decisions

1. **No build step** — pure static HTML/JS/CSS served as-is. Easier to debug, no toolchain lock-in.
2. **Single global CSS file** — `styles.css` carries all visual rules; updated atomically with cache-bust query `?v=N`.
3. **localStorage for client state** — cart/wishlist/recent don't need server sync for guests; logged-in users get server-side orders.
4. **IIFE for shared modules** — `products.js` wrapped in IIFE to avoid `const fmtIDR` / `const disc` collisions with `app.js`.
5. **JWT over server sessions** — stateless, scales horizontally, mobile-friendly.
6. **bcrypt 12 rounds** — strong but not crippling (~250ms hash on VPS2).
7. **Escrow 7-day auto-release** — buyer protection default; admin can force-release earlier.
8. **Midtrans SANDBOX** — public test mode; production toggle requires `MIDTRANS_IS_PRODUCTION=true` env.
9. **Cloudflare Tunnel** — no public port exposure on VPS; safer than opening 443/3001 to internet.

## Performance Budgets

- **TTFB** (cached): <50ms via Cloudflare edge
- **TTFB** (origin): ~150ms VPS2 → MySQL on VPS4
- **Largest Contentful Paint**: <1.5s on 4G (HTML+CSS inline critical path)
- **JS bundle**: ~46KB minified (app.js, no compression yet)
- **CSS bundle**: 51KB (styles.css, single file)

## Known Limitations

- No SSR — first paint depends on JS hydration
- No image CDN — product images served from DB BLOB or local path
- No service worker for offline mode (manifest.json exists but SW limited)
- No multi-currency — IDR only
- No i18n — Bahasa Indonesia only
