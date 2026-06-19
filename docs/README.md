# Z Store — Documentation

Formal documentation for the **Z Store** premium digital marketplace platform.

> AI tools · Software · Vouchers · Game accounts · Hosting · Jasa
> Instant delivery · Midtrans payment · Garansi 30 hari

## Table of Contents

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, stack, request lifecycle |
| [SECURITY.md](./SECURITY.md) | Security measures, audit results, hardening playbook |
| [API.md](./API.md) | REST API endpoint reference (auth, products, orders, admin) |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment guide (VPS, Cloudflare tunnel, cPanel) |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local dev setup, dev-server, hot-reload |
| [DATABASE.md](./DATABASE.md) | DB schema (users, products, orders, escrow, promos) |
| [TESTING.md](./TESTING.md) | Test suites (security, features, smoke) |
| [CHANGELOG.md](./CHANGELOG.md) | Versioned changelog |
| [screenshots/](./screenshots/) | Desktop & mobile UI captures |

## Quick Links

- **Production**: https://zcus.biz.id/shop/
- **Admin Panel**: https://zcus.biz.id/shop/admin.html
- **API base**: https://zcus.biz.id/shop-app/api
- **Health check**: `GET /api/health` → `{ status: "ok", db: true, ... }`
- **Repository**: github.com/zcuss/z-store

## Status (June 2026)

| Area | Status |
|---|---|
| Security tests | **39 / 44 pass** (89%) |
| Feature tests | 12 / 24 (50% — see TESTING.md) |
| Auth (register / login / JWT / 2FA) | ✅ Production |
| Midtrans payments (sandbox) | ✅ Tested |
| Escrow + auto-release | ✅ Production |
| Admin moderation | ✅ Production |
| UI redesign (sleek/minimal) | ✅ v3 deployed |
| Promo codes DB table | ⚠ Migration needed (`schema-v7-promos.sql`) |
| Newsletter subscribers DB | ⚠ Migration needed |

See [TESTING.md](./TESTING.md) for raw test output.
