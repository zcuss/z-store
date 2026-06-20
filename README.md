# Z Store v3 — Premium Digital Marketplace

> AI tools · Software · Vouchers · Game accounts · Hosting · Jasa
> Instant delivery via email · Pembayaran via Midtrans (QRIS / VA / GoPay / ShopeePay / CC) · Garansi 30 hari

🌐 **Live**: https://5.zcus.biz.id/shop/ (Cloudflare Tunnel · VPS1)
🌐 **Production (main)**: https://zcus.biz.id/shop/ (cPanel + VPS2 — pending VPS2 restart)
📋 **Preview Gallery**: [/preview/](./preview/) — visual tour 30+ fitur

---

## 🏗️ Stack (v3.0 — June 2026)

| Layer | Tech |
|---|---|
| **Frontend** | Static HTML + vanilla JS + CSS (no build step) + Tailwind CDN + shadcn-style components |
| **Backend** | Node.js 22 + Express 4 (production v1) + Fastify 4.28 (v2 ready, see [docs/V2-FASTIFY-BACKEND.md](./docs/V2-FASTIFY-BACKEND.md)) |
| **Database** | MySQL 8 (InnoDB, utf8mb4) · 23 tables · migrations via Knex (multi-driver ready) |
| **Auth** | JWT (30d) · bcrypt(12) · TOTP 2FA · Email+Pass · OAuth (Google/Telegram/Discord/WhatsApp) · Magic Link · OTP (email/WA/TG channels) |
| **RBAC** | `buyer` · `seller` · `admin` (sub: `cs`/`marketing`/`tech`/`service`) · `dev` (view-as-role) |
| **Payment** | Midtrans Snap (sandbox default · prod toggle via env) |
| **Multi-platform** | Telegram bot · Discord bot · WhatsApp Business · Catalog sync · Order broadcast · Auto-deliver credentials |
| **Process** | PM2 (`z-store`) |
| **CDN** | Cloudflare (free tier + trycloudflare dev tunnels) |
| **Hosting** | cPanel shared (frontend) + VPS1/VPS2 (backend) + VPS4 (DB) · see [docs/CPANEL-DEPLOY.md](./docs/CPANEL-DEPLOY.md) |
| **Tunnel** | Cloudflare Tunnel (named `zstore-shop`) — no public ports exposed |

---

## ✨ Fitur (30+)

### 🔐 Auth & Account
1. **Register email + password** → auto-OTP email verification (wajib sebelum full access)
2. **Login email + password** (rate-limited, bcrypt 12 rounds, account lockout)
3. **OTP login** via email / WhatsApp / Telegram
4. **Magic link** (15 min expiry, single-use)
5. **OAuth Google** — auto-mark email verified
6. **OAuth Telegram** (Login Widget) — link telegram_id
7. **OAuth Discord** — fetch /users/@me, link discord_id
8. **OAuth WhatsApp Business** — link E.164 phone
9. **Multi-platform linking** — 1 akun, semua platform (web + TG + DC + WA)
10. **2FA TOTP** — Authenticator app, 30s window

### 🛒 E-commerce
11. **Product catalog** — filter category / search / price / sort / discount
12. **Product detail** — gallery, reviews, related, share buttons
13. **Cart drawer** — localStorage + sync, qty controls, promo code
14. **Wishlist** — heart icon, share via public link
15. **Checkout (Midtrans Snap)** — 3-step, QRIS/VA/GoPay/ShopPay/CC
16. **Order success** — auto-deliver credentials ke email + linked platforms
17. **My orders** — tabs by status + escrow timeline
18. **Invoice PDF/HTML** — printable

### 💰 Payment + Escrow
19. **Midtrans Snap** — sandbox + production toggle
20. **Escrow 7-day auto-release** — protects both buyer + seller
21. **Webhook idempotent** — atomic SQL update with WHERE clause
22. **Garansi 30 hari** — replacement atau refund

### 🛍️ Seller
23. **Upload product** — auto-slug, bulk inventory
24. **Dashboard** — stats, saldo, escrow holds, top products
25. **Withdraw** — bank / e-wallet / crypto (min Rp 50k)
26. **Afiliasi** — komisi 10% per referral, monthly payout

### 👑 Admin (multi-role)
27. **Dashboard stats** — users / orders / revenue / GMV
28. **User moderation** — ban, role change, audit log
29. **Withdrawal approval** — manual + auto-refund
30. **Sub-roles** — CS / Marketing / Tech / Service
31. **Dev view-as-role** — switch to any user for debugging

### 📱 Multi-platform Sync
32. **Telegram bot** — catalog sync, order notifications, auto-deliver
33. **Discord bot** — slash commands, embeds, webhooks
34. **WhatsApp Business** — catalog sync (Meta Commerce), humanized CS templates
35. **Email SMTP** — Gmail SMTP for OTP + delivery (can swap to SendGrid/Resend)

### 📚 Documentation (Tailwind styled)
36. **Cara Order** — 5-step guide + payment + escrow + garansi
37. **Garansi 30 Hari** — replacement / refund table
38. **Refund Policy** — window + biaya admin
39. **Syarat & Ketentuan** — 8-section T&C
40. **Tentang Kami / About** — cerita + misi
41. **FAQ** — searchable self-service
42. **Bantuan / Support** — live chat + tiket
42. **Afiliasi** — komisi program

---

## 📂 Project Structure

```
z-store/
├── backend/                # v1 Express (production)
│   ├── server.js
│   ├── security.js
│   ├── schema*.sql
│   ├── test-security.sh
│   └── test-features.sh
├── backend-v2/             # v2 Fastify (ready, debug in progress)
│   ├── src/
│   │   ├── server.js
│   │   ├── db/             # Knex adapter + migrations
│   │   └── routes/         # auth, users, products, orders, admin, integrations, webhooks
│   └── package.json
├── frontend/shop/
│   ├── index.html          # Homepage
│   ├── product.html        # Product detail
│   ├── orders.html         # My orders
│   ├── payment.html        # Checkout
│   ├── order-success.html  # Post-payment
│   ├── admin.html          # Admin panel
│   ├── seller.html         # Seller dashboard
│   ├── settings.html       # Account + 2FA + linked platforms
│   ├── cara-order.html     # Doc: how to order
│   ├── garansi.html        # Doc: 30-day warranty
│   ├── refund-policy.html  # Doc: refund window
│   ├── terms.html          # Doc: T&C
│   ├── support.html        # Live chat + tiket
│   ├── affiliate.html      # Affiliate program
│   ├── notifications.html  # In-app notifications
│   ├── wishlist.html       # Wishlist
│   ├── preview/index.html  # Visual tour (30+ features)
│   ├── styles.css          # Custom design system (Slack minimalism)
│   ├── tw-components.css   # Tailwind shadcn-style components
│   ├── app.js              # Frontend logic (~1000 LOC)
│   └── products.js         # 20-item fallback catalog
└── docs/
    ├── README.md           # Docs index
    ├── ARCHITECTURE.md     # System architecture
    ├── SECURITY.md         # Security audit + hardening
    ├── API.md              # REST API reference
    ├── DEPLOYMENT.md       # VPS + nginx setup
    ├── DEVELOPMENT.md      # Local dev guide
    ├── DATABASE.md         # Schema + ERD
    ├── TESTING.md          # Test suites
    ├── CHANGELOG.md        # Versioned history
    ├── V2-FASTIFY-BACKEND.md   # v2 architecture
    ├── TAILWIND-FRONTEND.md    # Tailwind design system
    ├── BOT-CHANNELS.md         # Discord/Telegram/WA bot templates
    ├── AUTH.md                  # Multi-OAuth + account linking
    └── CPANEL-DEPLOY.md        # Static frontend deploy to cPanel
```

---

## 🚀 Quickstart

### Live (production)
Browse: **https://5.zcus.biz.id/shop/**

### Local dev (with MySQL)
```bash
git clone https://github.com/zcuss/z-store.git
cd z-store/backend
npm install
cp .env.example .env  # set DB_DRIVER, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
node server.js  # → http://localhost:3001
```

### Local dev (v2 Fastify, multi-DB)
```bash
cd z-store/backend-v2
npm install
DB_DRIVER=sqlite DB_FILE=./data/zstore.db JWT_SECRET=test node src/db/migrations.js
DB_DRIVER=sqlite DB_FILE=./data/zstore.db JWT_SECRET=test node src/server.js
# → http://localhost:3001 (sqlite, no MySQL needed)
```

### Frontend
Static files in `frontend/shop/`. Serve any way:
```bash
# Node
node frontend/shop/dev-server.js  # → http://localhost:3002

# Python
cd frontend/shop && python3 -m http.server 8000

# nginx
location /shop/ { alias /path/to/frontend/shop/; }
```

---

## 🧪 Testing

```bash
cd backend
bash test-security.sh                          # 44 security tests (SQLi/XSS/DDoS/auth/headers/traversal)
bash test-features.sh                          # 24 feature smoke tests (products/auth/orders/admin)
bash test-api.sh                              # E2E seller dashboard (against production)
```

Latest results (June 2026):
- Security: **39 / 44 pass** (89%)
- Features: **12 / 24** (rest are rate-limit false-positives + missing DB migrations)
- See [docs/TESTING.md](./docs/TESTING.md) for full breakdown

---

## 🚢 Deploy

### VPS (backend) — recommended via SSH

```bash
ssh zcus2
cd /root/z-store
git fetch origin && git reset --hard origin/master
pm2 restart z-store
nginx -s reload
```

### cPanel (frontend static files)

See [docs/CPANEL-DEPLOY.md](./docs/CPANEL-DEPLOY.md) for full guide.

TL;DR:
1. Upload `frontend/shop/` to `public_html/shop/` via FTP
2. Set perms: `chmod -R 755 public_html/shop`
3. Configure Cloudflare proxy + Origin Certificate
4. Reverse proxy `/shop-app/api/*` → VPS Node.js

---

## 📸 Preview

📋 **[/preview/](./preview/)** — visual tour 30+ fitur dengan click-through ke live pages.

---

## 🤝 Contributing

1. Fork repo
2. Branch: `git checkout -b feat/awesome`
3. Test locally: `bash backend/test-security.sh`
4. Commit: `git commit -m "feat: ..."`
5. PR to `master`

---

## 📄 License

Proprietary. © 2026 Z Store.

---

## 🔗 Links

- **Live**: https://5.zcus.biz.id/shop/
- **Production**: https://zcus.biz.id/shop/ (pending VPS2 restart)
- **Preview Gallery**: `/preview/`
- **Docs**: `/docs/`
- **GitHub**: github.com/zcuss/z-store
- **API Health**: `GET /api/health`
