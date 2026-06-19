-- Seed: seller + 4 products with inventory
-- Run: mysql -u zcuss_zshop -p'ZcusShop2026!Db' zcuss_zshop < seed.sql

-- Seller user
INSERT INTO users (email, password_hash, name, role)
VALUES ('seller@zcus.biz.id', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Zcus Official', 'seller')
ON DUPLICATE KEY UPDATE role = 'seller';

-- Get seller ID (assumes first user after test register = id 1; let me use email lookup)
SET @seller_id = (SELECT id FROM users WHERE email = 'seller@zcus.biz.id' LIMIT 1);

-- Products
INSERT INTO products (seller_id, name, description, category, price, original_price, emoji, type, stock, status) VALUES
(@seller_id, 'Claude Pro Annual License', 'Akses Claude Pro 1 tahun, login via Google atau email. Bisa Sonnet, Opus, Projects, dan Artifacts.', 'AI Tools', 2400000, 3000000, '🤖', 'digital', 5, 'active'),
(@seller_id, 'ChatGPT Plus 1 Year Voucher', 'Kode redeem ChatGPT Plus 1 tahun, region global. Instant delivery.', 'AI Tools', 1850000, 2400000, '💬', 'digital', 10, 'active'),
(@seller_id, 'Zcus T-Shirt Black Logo Premium', 'Kaos hitam logo Zcus, cotton 220gsm, sablon DTF. Size S/M/L/XL.', 'Merchandise', 149000, 199000, '👕', 'physical', 50, 'active'),
(@seller_id, 'Voucher Hosting cPanel 1 Tahun', 'Voucher hosting cPanel 1 tahun + domain gratis .my.id / .web.id. Auto-claim.', 'Voucher', 399000, 599000, '🎟️', 'digital', 20, 'active');

-- Inventory for digital products (mail:pass + tutorial)
-- Claude Pro
INSERT INTO product_inventory (product_id, mail, pass, two_fa, tutorial, status) VALUES
(1, 'claude-001@zcus.net', 'ZcusSecure2026!abc', 'JBSWY3DPEHPK3PXP', '1. Buka claude.ai\n2. Klik "Sign up with Google"\n3. Gunakan email & password di atas\n4. Masukkan 2FA code: buka Google Authenticator > add > masukkan code\n5. Selesai, akun Claude Pro aktif', 'available'),
(1, 'claude-002@zcus.net', 'ZcusSecure2026!def', 'KRSXG5DJN5SXKZBT', 'Tutorial sama seperti #1. Email & password berbeda.', 'available'),
(1, 'claude-003@zcus.net', 'ZcusSecure2026!ghi', 'MZUXGZBTK5SXKZBT', 'Tutorial sama seperti #1. Email & password berbeda.', 'available'),
(1, 'claude-004@zcus.net', 'ZcusSecure2026!jkl', 'JBSWY3DPEHPK3PXP', 'Tutorial sama seperti #1.', 'available'),
(1, 'claude-005@zcus.net', 'ZcusSecure2026!mno', 'KRSXG5DJN5SXKZBT', 'Tutorial sama seperti #1.', 'available');

-- ChatGPT Plus voucher codes
INSERT INTO product_inventory (product_id, pass, tutorial, status) VALUES
(2, 'OPENAI-VCHR-A1B2-C3D4-E5F6', '1. Buka chat.openai.com\n2. Login dengan akun OpenAI Tuan (atau buat baru)\n3. Klik avatar > My Plan > Redeem code\n4. Masukkan kode voucher di atas\n5. Plan Plus aktif 1 tahun', 'available'),
(2, 'OPENAI-VCHR-G7H8-I9J0-K1L2', 'Tutorial sama. Kode berbeda.', 'available'),
(2, 'OPENAI-VCHR-M3N4-O5P6-Q7R8', 'Tutorial sama.', 'available'),
(2, 'OPENAI-VCHR-S9T0-U1V2-W3X4', 'Tutorial sama.', 'available'),
(2, 'OPENAI-VCHR-Y5Z6-A7B8-C9D0', 'Tutorial sama.', 'available'),
(2, 'OPENAI-VCHR-E1F2-G3H4-I5J6', 'Tutorial sama.', 'available'),
(2, 'OPENAI-VCHR-K7L8-M9N0-O1P2', 'Tutorial sama.', 'available'),
(2, 'OPENAI-VCHR-Q3R4-S5T6-U7V8', 'Tutorial sama.', 'available'),
(2, 'OPENAI-VCHR-W9X0-Y1Z2-A3B4', 'Tutorial sama.', 'available'),
(2, 'OPENAI-VCHR-C5D6-E7F8-G9H0', 'Tutorial sama.', 'available');

-- Voucher hosting (kode + tutorial)
INSERT INTO product_inventory (product_id, pass, tutorial, status) VALUES
(4, 'ZCUS-HOST-2026-ABCD-1234', '1. Buka client.zcus.biz.id\n2. Login dengan email Tuan\n3. Pilih menu "Klaim Voucher" > masukkan kode\n4. Pilih paket hosting 1 tahun + domain gratis\n5. Akun hosting aktif dalam 1x24 jam', 'available'),
(4, 'ZCUS-HOST-2026-EFGH-5678', 'Tutorial sama. Kode berbeda.', 'available'),
(4, 'ZCUS-HOST-2026-IJKL-9012', 'Tutorial sama.', 'available');
