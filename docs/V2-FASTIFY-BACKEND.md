# Z Store v2 — Fastify Backend (In Progress)

> **Status:** Designed + scaffolded. Migration & routes written. Handler hang bug being debugged. Use v1 (Express) backend in production until v2 is fixed.

## Why migrate to Fastify

- **Performance** — 2-3x faster than Express, native async/await
- **Schema validation** — built-in JSON Schema (Ajv) replaces hand-rolled checks
- **Plugin model** — better encapsulation, hooks
- **Smaller surface** — fewer middleware surprises

## Why Knex.js (vs raw `mysql2`)

- **Multi-driver** — same code on MySQL, PostgreSQL, SQLite, CockroachDB
- **Query builder** — portable: `db('users').where(...).first()` works everywhere
- **Migrations** — built-in `knex migrate:latest`
- **No ORM lock-in** — can drop down to raw SQL when needed

## DB Driver Config

```bash
# .env
DB_DRIVER=mysql          # mysql | postgres | cockroach | sqlite
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=zcuss_zshop

# For postgres:
DB_DRIVER=postgres
DB_PORT=5432

# For cockroach:
DB_DRIVER=cockroach
DB_PORT=26257
DB_SSL=true

# For sqlite:
DB_DRIVER=sqlite
DB_FILE=./data/zstore.db
```

## Architecture

```
backend-v2/
├── src/
│   ├── server.js              # Fastify bootstrap + middleware + route mounting
│   ├── db/
│   │   ├── index.js           # Knex factory (mysql/pg/cockroach/sqlite)
│   │   └── migrations.js      # Schema (idempotent, portable)
│   └── routes/
│       ├── auth.js            # /api/auth/* — register/login/OTP/magic-link/OAuth (Google/TG/DC/WA)
│       ├── users.js           # /api/users/me, profile
│       ├── products.js        # /api/products/* — public + seller CRUD
│       ├── orders.js          # /api/orders/* — checkout/confirm/invoice
│       ├── admin.js           # /api/admin/* — users/stats/withdrawals (RBAC)
│       ├── integrations.js    # /api/integrations/* — TG/DC/WA bot connect + sync
│       └── webhooks.js         # /api/webhooks/* — Midtrans, TG/DC/WA callbacks
├── package.json
└── .env
```

## Features Implemented

| Feature | Endpoint | Status |
|---|---|---|
| Email + Password register | `POST /api/auth/register` | ✅ |
| Email + Password login | `POST /api/auth/login` | ✅ |
| OTP request (email/WA/TG) | `POST /api/auth/otp/request` | ✅ |
| OTP verify | `POST /api/auth/otp/verify` | ✅ |
| Magic link request | `POST /api/auth/magic-link/request` | ✅ |
| Magic link verify | `POST /api/auth/magic-link/verify` | ✅ |
| Google OAuth | `POST /api/auth/google` | ✅ |
| Telegram OAuth (Login Widget) | `POST /api/auth/telegram` | ✅ |
| Discord OAuth2 | `POST /api/auth/discord` | ✅ |
| WhatsApp Business linking | `POST /api/auth/whatsapp` | ✅ |
| Get current user | `GET /api/auth/me` | ✅ |
| Get linked platforms | `GET /api/auth/platforms` | ✅ |
| Link platform to existing | `POST /api/auth/link` | ✅ |
| Unlink platform | `POST /api/auth/unlink` | ✅ |
| Logout | `POST /api/auth/logout` | ✅ |
| Logout all devices | `POST /api/auth/logout-all` | ✅ |
| **Multi-role** | | |
| Roles: `buyer`, `seller`, `admin` (sub: `cs`/`marketing`/`tech`/`service`), `dev` | role + admin_subrole | ✅ |
| Dev view-as-role | `POST /api/auth/dev/view-as` | ✅ (dev only) |
| **Products** | | |
| Public list + filter | `GET /api/products` | ✅ |
| Public detail | `GET /api/products/:id` | ✅ |
| Slug lookup | `GET /api/products/slug/:slug` | ✅ |
| Categories | `GET /api/products/categories` | ✅ |
| Reviews (public get) | `GET /api/products/:id/reviews` | ✅ |
| Reviews (auth post) | `POST /api/products/:id/reviews` | ✅ |
| Seller: CRUD | `POST /api/products` (PUT/DELETE) | ✅ |
| Inventory add | `POST /api/products/:id/inventory` | ✅ |
| **Orders** | | |
| My orders | `GET /api/orders/me` | ✅ |
| Order detail | `GET /api/orders/:id` | ✅ |
| Checkout (Midtrans Snap) | `POST /api/orders/checkout` | ✅ |
| Confirm delivery (escrow release) | `POST /api/orders/:id/confirm-delivery` | ✅ |
| Invoice | `GET /api/orders/:id/invoice` | ✅ |
| Midtrans webhook (idempotent) | `POST /api/webhooks/midtrans` | ✅ |
| **Admin** | | ✅ |
| Dashboard stats | `GET /api/admin/stats` | ✅ |
| Users list + role change | `GET /api/admin/users` (PUT role) | ✅ |
| Orders list | `GET /api/admin/orders` | ✅ |
| Withdrawals list | `GET /api/admin/withdrawals` | ✅ |
| Withdraw approve/reject | `POST /api/admin/withdrawals/:id/(approve|reject)` | ✅ |
| **Integrations** | | |
| Connect Telegram bot | `POST /api/integrations/telegram/bot` | ✅ |
| Connect Discord bot | `POST /api/integrations/discord/bot` | ✅ |
| Connect WhatsApp Business | `POST /api/integrations/whatsapp/connect` | ✅ |
| List my integrations | `GET /api/integrations/me` | ✅ |
| Sync catalog to platform | `POST /api/integrations/sync/catalog/:platform` | ✅ |
| Order notify broadcast | `POST /api/integrations/notify-order` | ✅ |
| **Webhooks** | | |
| Midtrans payment notif | `POST /api/webhooks/midtrans` | ✅ |
| Telegram bot updates | `POST /api/webhooks/telegram` | ✅ |
| Discord interactions | `POST /api/webhooks/discord` | ✅ |
| WhatsApp Business webhook | `POST /api/webhooks/whatsapp` | ✅ |

## Migrations

`src/db/migrations.js` — Knex-based, idempotent (skips existing tables). Run:

```bash
DB_DRIVER=mysql node src/db/migrations.js
```

Tables created:
- `users` (with `google_id`, `telegram_id`, `discord_id`, `whatsapp_number`, `email_verified`, `role`, `admin_subrole`)
- `magic_links` (for email magic login)
- `otp_codes` (with `channel`: email/whatsapp/telegram)
- `user_sessions` (JWT blacklist)
- `platform_integrations`
- `categories`, `products`, `product_inventory`
- `orders`, `order_items`, `deliveries`
- `promo_codes`, `reviews`
- `escrow_holds`, `seller_balances`, `withdrawals`, `transactions`
- `notifications`, `security_audit_log`, `newsletter_subscribers`

## Run locally

```bash
cd backend-v2
npm install
cp .env.example .env  # configure DB_DRIVER + creds
node src/server.js
```

## Migration to v2 from v1

v1 backend (`backend/server.js` Express) is still running in production.
Migration steps:
1. `cd backend-v2 && npm install`
2. Configure DB_DRIVER in .env
3. `node src/db/migrations.js` (idempotent — won't drop existing tables)
4. Update nginx/Caddy proxy to forward `/shop-app/*` to new port (e.g. 3002)
5. Update Cloudflare tunnel to point at new backend
6. Decommission v1

## Known Issues

- **Handler hang on first request** — possibly rate-limit preHandler or static-serve plugin order. Debug in progress.

## Tailwind Frontend Plan

Replace custom CSS with Tailwind + shadcn/ui inspired components:
- Card, Button, Input, Badge, Dialog, Tabs, Tooltip
- Dark mode via `class` strategy
- Slack-professional minimalism: 8px grid, sharp corners, single accent

See `/preview/` for live UI tour.
