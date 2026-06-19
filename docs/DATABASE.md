# Z Store — Database Schema

**Engine**: MySQL 8 / InnoDB / utf8mb4  
**Database**: `zcuss_zshop` (23 tables)  
**Host**: VPS4 (8.215.192.96) — accessed over Tailscale

## Entity Relationship Overview

```
users ─────┬───── orders ──── order_items ──── products ──── sellers_balances
           │       │                              │
           │       └── deliveries                 ├── reviews
           │                                      ├── product_views
           │                                      ├── product_inventory
           │                                      └── recently_viewed
           │
           ├─── platform_integrations (OAuth links)
           ├─── user_sessions (JWT blacklist)
           ├─── security_audit_log
           └─── notifications

orders ─── escrow_holds ─── escrow_config
       ─── transactions
       ─── service_fees

sellers ──── withdrawals ──── payout_settings

promo_codes ──── (used by orders)
newsletter_subscribers ──── (marketing)
```

## Tables (23)

### users

| Column | Type | Notes |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | VARCHAR(255) NULL | bcrypt(12) |
| google_id | VARCHAR(255) NULL UNIQUE | OAuth |
| name | VARCHAR(100) | |
| role | ENUM('buyer','seller','admin') | default 'buyer' |
| bio | TEXT NULL | |
| avatar_url | VARCHAR(500) NULL | |
| phone | VARCHAR(20) NULL | |
| email_verified | BOOLEAN | default false |
| totp_secret | VARCHAR(255) NULL | 2FA |
| totp_enabled | BOOLEAN | default false |
| linked_telegram_id | VARCHAR(50) NULL | |
| linked_whatsapp_number | VARCHAR(20) NULL | |
| linked_discord_id | VARCHAR(50) NULL | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### products

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| seller_id | INT FK users.id | |
| name | VARCHAR(200) | |
| category | VARCHAR(50) | AI Tools, Merchandise, dll |
| description | TEXT | |
| price | DECIMAL(12,2) | |
| original_price | DECIMAL(12,2) NULL | for discount display |
| stock | INT | |
| image_url | VARCHAR(500) NULL | |
| emoji | VARCHAR(10) | fallback icon |
| rating | DECIMAL(3,2) | avg, default 0 |
| review_count | INT | default 0 |
| sold | INT | default 0 |
| featured | BOOLEAN | |
| flash | BOOLEAN | flash sale |
| status | ENUM('active','archived','draft') | default 'active' |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### product_inventory

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| product_id | INT FK | |
| mail | VARCHAR(255) NULL | digital delivery |
| pass | VARCHAR(255) NULL | encrypted |
| two_fa | VARCHAR(100) NULL | |
| tutorial | TEXT NULL | |
| status | ENUM('available','reserved','sold') | |
| order_id | INT FK orders.id NULL | when reserved |
| reserved_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |

### orders

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| buyer_id | INT FK users.id | |
| midtrans_order_id | VARCHAR(100) UNIQUE | |
| midtrans_transaction_id | VARCHAR(100) NULL | |
| status | ENUM('pending','paid','failed','cancelled','completed','disputed') | |
| subtotal | DECIMAL(12,2) | |
| discount | DECIMAL(12,2) | |
| platform_fee | DECIMAL(12,2) | |
| payment_fee | DECIMAL(12,2) | |
| total | DECIMAL(12,2) | |
| payment_type | VARCHAR(50) NULL | qris, va, gopay, dll |
| promo_code | VARCHAR(50) NULL | |
| paid_at | TIMESTAMP NULL | |
| confirmed_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |

### order_items

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| order_id | INT FK | |
| product_id | INT FK | |
| qty | INT | |
| price | DECIMAL(12,2) | snapshot at order time |

### deliveries

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| order_id | INT FK | |
| product_id | INT FK | |
| item_id | INT FK product_inventory.id NULL | |
| channel | ENUM('email','dashboard') | |
| recipient | VARCHAR(255) | email or user_id |
| sent_at | TIMESTAMP | |
| status | ENUM('sent','failed','bounced') | |

### escrow_holds

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| order_id | INT FK | |
| seller_id | INT FK users.id | |
| amount | DECIMAL(12,2) | gross |
| seller_amount | DECIMAL(12,2) | net |
| platform_fee | DECIMAL(12,2) | |
| payment_fee | DECIMAL(12,2) | |
| status | ENUM('held','released','refunded') | |
| release_at | DATETIME | default +7 days |
| released_at | TIMESTAMP NULL | |

### escrow_config

| Column | Type | Notes |
|---|---|---|
| id | INT PK | always 1 |
| default_days | INT | default 7 |
| platform_fee_percent | DECIMAL(5,2) | default 5.00 |
| payment_fee_percent | DECIMAL(5,2) | default 2.90 |

### seller_balances

| Column | Type | Notes |
|---|---|---|
| user_id | INT PK FK | |
| available | DECIMAL(12,2) | default 0 |
| pending | DECIMAL(12,2) | in escrow |
| total_earned | DECIMAL(12,2) | lifetime |
| updated_at | TIMESTAMP | |

### withdrawals

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id | INT FK | |
| amount | DECIMAL(12,2) | |
| fee | DECIMAL(12,2) | |
| net_amount | DECIMAL(12,2) | |
| method | VARCHAR(50) | bank, e-wallet, crypto |
| account_info | TEXT | JSON |
| status | ENUM('pending','processing','completed','rejected') | |
| processed_at | TIMESTAMP NULL | |
| notes | TEXT NULL | |

### payout_settings

| Column | Type | Notes |
|---|---|---|
| user_id | INT PK FK | |
| method | ENUM('bank','ewallet','crypto') | |
| account_name | VARCHAR(100) | |
| account_number | VARCHAR(50) | |
| bank_code | VARCHAR(10) NULL | |
| updated_at | TIMESTAMP | |

### transactions

Audit log of all money movements.

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id | INT FK | |
| type | ENUM('sale','refund','withdraw','topup','fee') | |
| amount | DECIMAL(12,2) | |
| reference_type | VARCHAR(50) | order, withdrawal, dll |
| reference_id | INT | |
| description | VARCHAR(255) | |
| created_at | TIMESTAMP | |

### reviews

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| product_id | INT FK | |
| user_id | INT FK | |
| rating | TINYINT | 1-5 |
| text | TEXT | |
| created_at | TIMESTAMP | |

### product_views

Tracking for "recently viewed".

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| product_id | INT FK | |
| user_id | INT FK NULL | |
| source | VARCHAR(50) | 'web', 'mobile', 'api' |
| viewed_at | TIMESTAMP | |

### platform_integrations

OAuth linked accounts (Telegram, WhatsApp, Discord).

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| owner_id | INT FK users.id | |
| platform | ENUM('telegram','whatsapp','discord') | |
| enabled | BOOLEAN | |
| status | ENUM('connected','pending','disconnected') | |
| last_connected_at | TIMESTAMP NULL | |
| config | JSON | platform-specific |

### notifications

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id | INT FK | |
| type | VARCHAR(50) | order, withdraw, system |
| title | VARCHAR(200) | |
| body | TEXT | |
| read_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |

### user_sessions (JWT blacklist)

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id | INT FK | |
| jti | VARCHAR(100) UNIQUE | JWT id |
| expires_at | TIMESTAMP | |
| revoked_at | TIMESTAMP | |

### security_audit_log

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| event_type | VARCHAR(50) | login_success, login_fail, dll |
| user_id | INT NULL | |
| ip | VARCHAR(45) | |
| user_agent | TEXT | |
| metadata | JSON | |
| created_at | TIMESTAMP | |

### promo_codes

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| code | VARCHAR(50) UNIQUE | |
| type | ENUM('percent','flat') | |
| value | DECIMAL(10,2) | |
| min_order | DECIMAL(12,2) | default 0 |
| max_uses | INT NULL | unlimited if NULL |
| used_count | INT default 0 | |
| active | BOOLEAN | |
| expires_at | DATETIME NULL | |
| label | VARCHAR(100) NULL | display name |
| created_at | TIMESTAMP | |

### newsletter_subscribers

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| email | VARCHAR(255) UNIQUE | |
| source | VARCHAR(50) default 'homepage' | |
| subscribed_at | TIMESTAMP | |
| unsubscribed_at | DATETIME NULL | |

### service_fees

Configurable per-transaction fees.

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| name | VARCHAR(50) UNIQUE | platform_fee, payment_processing, withdraw_fee |
| fee_type | ENUM('percent','flat') | |
| fee_value | DECIMAL(10,4) | |
| min_amount | DECIMAL(12,2) default 0 | |
| max_amount | DECIMAL(12,2) NULL | |
| active | BOOLEAN | |

### whatsapp_sessions

WhatsApp Business API sessions per user.

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id | INT FK | |
| session_id | VARCHAR(100) UNIQUE | |
| phone | VARCHAR(20) | |
| status | VARCHAR(20) | |
| created_at | TIMESTAMP | |

## Migrations

Run in order:

```bash
cd backend
for f in schema.sql schema-v4.sql schema-v5.sql schema-v6-security.sql schema-v7-promos.sql; do
  echo "Applying $f..."
  mysql -u zcuss_zshop -p zcuss_zshop < "$f"
done
```

| Version | Adds | File |
|---|---|---|
| v1 | Core (users, products, orders) | `schema.sql` |
| v4 | Reviews, search | `schema-v4.sql` |
| v5 | Escrow, seller balance, withdrawals | `schema-v5.sql` |
| v6 | 2FA, security audit log, sessions | `schema-v6-security.sql` |
| v7 | Promo codes, newsletter | `schema-v7-promos.sql` |

## Indexes

Critical indexes (auto-created with PRIMARY/UNIQUE):

- `users.email` UNIQUE
- `products.seller_id` (FK)
- `products.category` (for filter)
- `products.status` (for active filter)
- `products.created_at` (for sort=newest)
- `orders.buyer_id` (for /orders/me)
- `orders.status` (for status filters)
- `orders.midtrans_order_id` UNIQUE (for webhook lookup)
- `order_items.order_id` (FK)
- `escrow_holds.order_id`, `seller_id` (FK)
- `reviews.product_id` (FK, for /products/:id/reviews)
- `product_views.user_id` (FK, for recently-viewed)

For high-traffic, add:

```sql
CREATE INDEX idx_products_name_search ON products(name);
CREATE FULLTEXT INDEX ft_products_name ON products(name, description);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_escrow_release_at ON escrow_holds(release_at, status);
```

## Seed Data

`backend/seed.sql` includes:
- 1 admin user (`zcusgt@gmail.com`)
- 20 sample products (across 7 categories)
- Default `service_fees` entries
- Default `escrow_config` row

Run after migrations: `mysql -u zcuss_zshop -p zcuss_zshop < seed.sql`.
