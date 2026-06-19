-- Add 2 more products to balance the grid
INSERT INTO products (seller_id, name, description, category, price, original_price, emoji, type, stock, status)
VALUES
(1, 'Capcut Pro Annual License', 'Akun Capcut Pro 1 tahun, akses semua fitur premium, no watermark, export 4K.', 'Digital Goods', 299000, 499000, '🎬', 'digital', 15, 'active'),
(1, 'Netflix Premium 1 Bulan Shared', 'Akun Netflix Premium 1 bulan, sharing 4 user, full HD Ultra HD, semua region.', 'Voucher', 49000, 79000, '🎬', 'digital', 50, 'active');

-- Add inventory for these
INSERT INTO product_inventory (product_id, mail, pass, two_fa, tutorial, status) VALUES
(5, 'capcut-001@zcus.net', 'CapcutPro2026!a1', 'JBSWY3DPEHPK3PXP', '1. Login ke Capcut web\n2. Login pakai email & password di atas\n3. Masukkan 2FA code\n4. Selesai, akun Pro aktif', 'available'),
(5, 'capcut-002@zcus.net', 'CapcutPro2026!b2', 'KRSXG5DJN5SXKZBT', 'Tutorial sama, akun berbeda', 'available'),
(6, 'shared-001@zcus.net', 'Net2026!shared1', NULL, '1. Download Netflix app\n2. Login pakai email di atas\n3. Pilih profile\n4. Streaming HD 4K, 4 user sharing', 'available');

-- Update some stats for the existing products to look more realistic
UPDATE products SET sold = 128 WHERE id = 1;
UPDATE products SET sold = 89 WHERE id = 2;
UPDATE products SET sold = 234 WHERE id = 3;
UPDATE products SET sold = 156 WHERE id = 4;
UPDATE products SET sold = 78 WHERE id = 5;
UPDATE products SET sold = 312 WHERE id = 6;
