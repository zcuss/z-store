-- Zcus Shop v5 — Escrow + Seller Balance + Withdrawals + Fees
-- Run: mysql -u zcuss_zshop -p'ZcusShop2026!Db' zcuss_zshop < schema-v5.sql

-- Service fees config
CREATE TABLE IF NOT EXISTS service_fees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  fee_type ENUM('percent','flat') NOT NULL,
  fee_value DECIMAL(10,4) NOT NULL,
  min_amount DECIMAL(12,2) DEFAULT 0,
  max_amount DECIMAL(12,2) NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO service_fees (name, fee_type, fee_value, min_amount, max_amount) VALUES
  ('platform_fee', 'percent', 5.00, 0, 50000),
  ('payment_processing', 'percent', 2.90, 0, NULL),
  ('withdraw_fee', 'flat', 5000, 10000, NULL);

-- Seller balance (available, pending, lifetime)
CREATE TABLE IF NOT EXISTS seller_balances (
  user_id INT PRIMARY KEY,
  available DECIMAL(14,2) DEFAULT 0,  -- bisa withdraw
  pending DECIMAL(14,2) DEFAULT 0,    -- masih di escrow
  total_earned DECIMAL(14,2) DEFAULT 0, -- lifetime earning
  total_withdrawn DECIMAL(14,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO seller_balances (user_id, available, pending, total_earned) VALUES
  (1, 0, 0, 0),  -- admin
  (2, 0, 0, 0);  -- seller (legacy)

-- Withdrawals (request payout)
CREATE TABLE IF NOT EXISTS withdrawals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  fee DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,
  method ENUM('bank_transfer','ewallet','va') NOT NULL,
  destination VARCHAR(255) NOT NULL,  -- bank account / e-wallet number
  destination_name VARCHAR(100) NULL,
  bank_code VARCHAR(20) NULL,
  status ENUM('pending','processing','completed','failed','cancelled') DEFAULT 'pending',
  midtrans_disbursement_id VARCHAR(100) NULL,
  notes TEXT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_status (user_id, status),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Escrow holds (funds held for X days before release to seller)
CREATE TABLE IF NOT EXISTS escrow_holds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  seller_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,  -- gross amount paid
  seller_amount DECIMAL(12,2) NOT NULL,  -- after fees
  platform_fee DECIMAL(12,2) NOT NULL,
  payment_fee DECIMAL(12,2) NOT NULL,
  status ENUM('held','released','disputed','refunded') DEFAULT 'held',
  held_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  release_at TIMESTAMP NULL,  -- when it becomes available to seller
  released_at TIMESTAMP NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_seller (seller_id),
  INDEX idx_status_release (status, release_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Transaction ledger (full audit trail)
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('sale','refund','withdraw','fee','adjustment','bonus') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,  -- positive=credit, negative=debit
  balance_before DECIMAL(14,2) NULL,
  balance_after DECIMAL(14,2) NULL,
  reference_type ENUM('order','withdrawal','manual') NOT NULL,
  reference_id INT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add bank/ewallet info to users for withdrawals
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS bank_holder VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS ewallet_type ENUM('gopay','ovo','dana','shopeepay') NULL,
  ADD COLUMN IF NOT EXISTS ewallet_number VARCHAR(50) NULL;

-- Payout settings (per-seller)
CREATE TABLE IF NOT EXISTS payout_settings (
  user_id INT PRIMARY KEY,
  auto_payout BOOLEAN DEFAULT FALSE,
  min_payout DECIMAL(12,2) DEFAULT 50000,
  escrow_days INT DEFAULT 7,
  preferred_method ENUM('bank_transfer','ewallet') DEFAULT 'bank_transfer',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO payout_settings (user_id, auto_payout, min_payout, escrow_days) VALUES
  (1, FALSE, 50000, 7),
  (2, FALSE, 50000, 7);

-- Escrow settings
CREATE TABLE IF NOT EXISTS escrow_config (
  id INT PRIMARY KEY DEFAULT 1,
  default_days INT DEFAULT 7,
  min_release_amount DECIMAL(12,2) DEFAULT 10000,
  platform_fee_percent DECIMAL(5,2) DEFAULT 5.00,
  payment_fee_percent DECIMAL(5,2) DEFAULT 2.90,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO escrow_config (id, default_days, min_release_amount, platform_fee_percent, payment_fee_percent)
VALUES (1, 7, 10000, 5.00, 2.90);

-- Show all
SHOW TABLES;
