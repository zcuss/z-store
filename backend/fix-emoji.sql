-- Update emojis (file saved as UTF-8)
UPDATE products SET emoji='🤖' WHERE id=1;
UPDATE products SET emoji='💬' WHERE id=2;
UPDATE products SET emoji='👕' WHERE id=3;
UPDATE products SET emoji='🎟️' WHERE id=4;
SELECT id, name, emoji FROM products;
