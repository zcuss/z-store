-- Zcus Shop v8 — Allow NULL email for OAuth-only accounts (Telegram, WhatsApp, Discord)
-- Run: mysql -u zcuss_zshop -p'ZcusShop2026!Db' zcuss_zshop < schema-v8-null-email.sql
-- Fixes: /api/auth/telegram + /api/auth/whatsapp errors when user has no email

ALTER TABLE users MODIFY COLUMN email VARCHAR(190) NULL;

-- Make email_verified = TRUE for users without email (auto-skipped since email is required by some endpoints)
-- Don't auto-set; client should handle 403 for restricted endpoints

-- Verify
SHOW COLUMNS FROM users LIKE 'email';
