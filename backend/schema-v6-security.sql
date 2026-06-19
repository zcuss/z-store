-- Z Store v6 — Security hardening migration (MySQL 8 / MariaDB compatible)
-- Adds: 2FA TOTP secret, email verification columns, audit log, token blacklist table

DELIMITER $$
DROP PROCEDURE IF EXISTS migrate_v6_security $$
CREATE PROCEDURE migrate_v6_security()
BEGIN
  -- totp_secret
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_secret') THEN
    ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64) NULL AFTER password_hash;
  END IF;
  -- totp_enabled
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_enabled') THEN
    ALTER TABLE users ADD COLUMN totp_enabled TINYINT(1) DEFAULT 0 AFTER totp_secret;
  END IF;
  -- totp_backup_codes
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_backup_codes') THEN
    ALTER TABLE users ADD COLUMN totp_backup_codes TEXT NULL AFTER totp_enabled;
  END IF;
  -- email_verified
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified') THEN
    ALTER TABLE users ADD COLUMN email_verified TINYINT(1) DEFAULT 0 AFTER totp_backup_codes;
  END IF;
  -- email_verify_token
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verify_token') THEN
    ALTER TABLE users ADD COLUMN email_verify_token VARCHAR(128) NULL AFTER email_verified;
  END IF;
  -- email_verify_expires
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verify_expires') THEN
    ALTER TABLE users ADD COLUMN email_verify_expires DATETIME NULL AFTER email_verify_token;
  END IF;
END $$
DELIMITER ;

CALL migrate_v6_security();
DROP PROCEDURE migrate_v6_security;

-- Token blacklist (logout-invalidated JWTs)
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti VARCHAR(128) PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit log for security events
CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  event VARCHAR(64) NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_event (event),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;