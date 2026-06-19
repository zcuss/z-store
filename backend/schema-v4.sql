-- Zcus Shop v4 — Multi-platform schema
-- Run: mysql -u zcuss_zshop -p'ZcusShop2026!Db' zcuss_zshop < schema-v4.sql

-- Add linked accounts columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS linked_telegram_id VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS linked_whatsapp_number VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS linked_discord_id VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS bio TEXT NULL,
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) NULL,
  ADD INDEX IF NOT EXISTS idx_telegram (linked_telegram_id),
  ADD INDEX IF NOT EXISTS idx_whatsapp (linked_whatsapp_number),
  ADD INDEX IF NOT EXISTS idx_discord (linked_discord_id);

-- Update role enum to include cs/marketing
ALTER TABLE users MODIFY COLUMN role ENUM('buyer','seller','admin','cs','marketing') DEFAULT 'buyer';

-- Platform integrations (bot config for sellers/admins)
CREATE TABLE IF NOT EXISTS platform_integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  platform ENUM('telegram','whatsapp','discord','slack') NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  config JSON NULL,
  status ENUM('active','inactive','error','pending') DEFAULT 'pending',
  last_connected_at TIMESTAMP NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_owner_platform (owner_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- WhatsApp sessions (for QR-based auth)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(30) NULL,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  qr_code TEXT NULL,
  status ENUM('waiting_qr','authenticated','disconnected','banned') DEFAULT 'waiting_qr',
  connected_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bot command logs (audit trail)
CREATE TABLE IF NOT EXISTS bot_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform ENUM('telegram','whatsapp','discord','web') NOT NULL,
  user_id INT NULL,
  command VARCHAR(100) NULL,
  payload JSON NULL,
  response TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_platform_user (platform, user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Team members for admin/cs/marketing roles (sub-users under admin)
CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  member_id INT NOT NULL,
  role ENUM('cs','marketing') NOT NULL,
  permissions JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_parent_member (parent_id, member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add reviews table (replace mock reviews with real)
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product views (for stats)
CREATE TABLE IF NOT EXISTS product_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NULL,
  ip VARCHAR(45) NULL,
  source ENUM('web','telegram','whatsapp','discord') DEFAULT 'web',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product (product_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User sessions across platforms (for cross-platform login)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  platform ENUM('web','telegram','whatsapp','discord') NOT NULL,
  session_token VARCHAR(500) NOT NULL,
  device_info VARCHAR(255) NULL,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_platform (user_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notifications (cross-platform)
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  link VARCHAR(500) NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_unread (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Show all tables
SHOW TABLES;
