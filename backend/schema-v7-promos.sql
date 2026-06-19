-- Zcus Shop v7 — Promos + Newsletter tables
-- Run: mysql -u zcuss_zshop -p'ZcusShop2026!Db' zcuss_zshop < schema-v7-promos.sql
-- Fixes: /api/promos + /api/newsletter/subscribe 500 errors

CREATE TABLE IF NOT EXISTS promo_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  type ENUM('percent','flat') NOT NULL DEFAULT 'percent',
  value DECIMAL(10,2) NOT NULL,
  min_order DECIMAL(12,2) DEFAULT 0,
  max_uses INT DEFAULT NULL,
  used_count INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  expires_at DATETIME DEFAULT NULL,
  label VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed a couple of starter promos
INSERT IGNORE INTO promo_codes (code, type, value, min_order, max_uses, label) VALUES
  ('WELCOME50', 'flat', 50000, 100000, 1000, 'Diskon Rp 50k untuk member baru'),
  ('WELCOME10', 'percent', 10, 50000, NULL, 'Diskon 10% untuk subscriber newsletter'),
  ('FLASH20', 'percent', 20, 200000, 500, 'Flash sale 20% off');

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(50) DEFAULT 'homepage',
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify
SELECT 'promo_codes' AS tbl, COUNT(*) AS rows_count FROM promo_codes
UNION ALL
SELECT 'newsletter_subscribers', COUNT(*) FROM newsletter_subscribers;
