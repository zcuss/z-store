// Z Store v5 — Multi-platform backend
// Adds: seller dashboard, admin panel, platform integrations, reviews, notifications, link-account
// v5: SEO slug, admin orders/products/withdrawals, categories, promos, order detail, confirm delivery
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const midtransClient = require('midtrans-client');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'zcus-shop-dev-secret-change-me';
const MOUNT_PREFIX = process.env.MOUNT_PREFIX || '/shop-app';

const app = express();
app.use(express.json({ limit: '2mb', strict: false }));
app.use(express.urlencoded({ extended: true }));

// Global error handler to prevent server crash on bad requests
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  if (err) {
    console.error('Express error:', err.message);
    return res.status(500).json({ error: 'server error' });
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  if (MOUNT_PREFIX && req.url.startsWith(MOUNT_PREFIX)) {
    req.url = req.url.slice(MOUNT_PREFIX.length) || '/';
  }
  next();
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'zcuss_zshop',
  password: process.env.DB_PASS || 'ZcusShop2026!Db',
  database: process.env.DB_NAME || 'zcuss_zshop',
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4_unicode_ci'
});

const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY || '',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
});

const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'zcusgt@gmail.com',
    pass: process.env.GMAIL_APP_PASS || ''
  }
});

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query('SELECT id, email, name, role, linked_telegram_id, linked_whatsapp_number, linked_discord_id, bio, avatar_url FROM users WHERE id = ?', [decoded.id]);
    if (!rows[0]) return res.status(401).json({ error: 'invalid token' });
    req.user = rows[0];
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'forbidden', need: roles });
  next();
};

app.get('/api/health', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT 1 as ok');
    const [tables] = await pool.query('SHOW TABLES');
    res.json({ status: 'ok', node: process.version, db: r[0].ok === 1, tables: tables.length, time: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Zcus Shop API v4',
    version: '4.0.0',
    endpoints: {
      auth: ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/google', 'GET /api/auth/me', 'POST /api/auth/link (telegram/whatsapp/discord)'],
      products: ['GET /api/products', 'GET /api/products/:id', 'POST /api/products (seller)', 'POST /api/products/:id/inventory (seller)', 'GET /api/products/:id/reviews'],
      orders: ['POST /api/orders/checkout', 'POST /api/orders/notification (webhook)', 'GET /api/orders/me'],
      seller: ['GET /api/seller/dashboard', 'GET /api/seller/products', 'GET /api/seller/orders'],
      admin: ['GET /api/admin/users', 'GET /api/admin/stats'],
      integrations: ['GET /api/integrations', 'POST /api/integrations/telegram', 'POST /api/integrations/whatsapp/qr', 'GET /api/integrations/whatsapp/qr/:session', 'DELETE /api/integrations/:id'],
      reviews: ['GET /api/products/:id/reviews', 'POST /api/products/:id/reviews'],
      notifications: ['GET /api/notifications', 'POST /api/notifications/:id/read']
    }
  });
});

// ============ AUTH ============
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email + password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const userRole = role === 'seller' ? 'seller' : 'buyer';
    const [r] = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [email, hash, name || email.split('@')[0], userRole]
    );
    const user = { id: r.insertId, email, name: name || email.split('@')[0], role: userRole };
    res.json({ user, token: signToken(user) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email already registered' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email + password required' });
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows[0]) return res.status(401).json({ error: 'invalid credentials' });
    if (!rows[0].password_hash) return res.status(401).json({ error: 'login with Google instead' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
    res.json({ user, token: signToken(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/google', async (req, res) => {
  const { google_id, email, name } = req.body;
  if (!google_id || !email) return res.status(400).json({ error: 'google_id + email required' });
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE google_id = ? OR email = ?', [google_id, email]);
    let user;
    if (existing[0]) {
      if (!existing[0].google_id) await pool.query('UPDATE users SET google_id = ? WHERE id = ?', [google_id, existing[0].id]);
      user = { id: existing[0].id, email: existing[0].email, name: existing[0].name, role: existing[0].role };
    } else {
      const [r] = await pool.query('INSERT INTO users (email, google_id, name, role) VALUES (?, ?, ?, ?)', [email, google_id, name || email.split('@')[0], 'buyer']);
      user = { id: r.insertId, email, name: name || email.split('@')[0], role: 'buyer' };
    }
    res.json({ user, token: signToken(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role,
      linked_telegram_id: req.user.linked_telegram_id,
      linked_whatsapp_number: req.user.linked_whatsapp_number,
      linked_discord_id: req.user.linked_discord_id,
      bio: req.user.bio, avatar_url: req.user.avatar_url
    }
  });
});

// Link account to telegram/whatsapp/discord (cross-platform)
app.post('/api/auth/link', authMiddleware, async (req, res) => {
  const { platform, identifier } = req.body;
  if (!['telegram', 'whatsapp', 'discord'].includes(platform)) return res.status(400).json({ error: 'invalid platform' });
  if (!identifier) return res.status(400).json({ error: 'identifier required' });
  try {
    const col = platform === 'telegram' ? 'linked_telegram_id' : platform === 'whatsapp' ? 'linked_whatsapp_number' : 'linked_discord_id';
    // Check if already linked to another account
    const [existing] = await pool.query(`SELECT id, email FROM users WHERE ${col} = ? AND id != ?`, [identifier, req.user.id]);
    if (existing[0]) return res.status(409).json({ error: `${platform} already linked to another account` });
    await pool.query(`UPDATE users SET ${col} = ? WHERE id = ?`, [identifier, req.user.id]);
    res.json({ ok: true, platform, identifier });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/unlink', authMiddleware, async (req, res) => {
  const { platform } = req.body;
  if (!['telegram', 'whatsapp', 'discord'].includes(platform)) return res.status(400).json({ error: 'invalid platform' });
  const col = platform === 'telegram' ? 'linked_telegram_id' : platform === 'whatsapp' ? 'linked_whatsapp_number' : 'linked_discord_id';
  await pool.query(`UPDATE users SET ${col} = NULL WHERE id = ?`, [req.user.id]);
  res.json({ ok: true });
});

// ============ PRODUCTS ============
app.get('/api/products', async (req, res) => {
  const { category, search, limit = 50 } = req.query;
  let sql = 'SELECT p.*, u.name as seller_name FROM products p JOIN users u ON p.seller_id = u.id WHERE p.status = ?';
  const args = ['active'];
  if (category) { sql += ' AND p.category = ?'; args.push(category); }
  if (search) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; args.push('%' + search + '%', '%' + search + '%'); }
  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  args.push(parseInt(limit));
  try {
    const [rows] = await pool.query(sql, args);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ SEO: Product detail page (for sharing) ============
app.get('/api/products/:id/jsonld', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT p.*, u.name as seller_name FROM products p JOIN users u ON p.seller_id = u.id WHERE p.id = ?',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    const p = rows[0];
    const [[{ review_count, review_avg }]] = await pool.query('SELECT COUNT(*) as count, COALESCE(AVG(rating), 0) as avg FROM reviews WHERE product_id = ?', [p.id]);
    res.json({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: p.description || p.name,
      image: `https://zcus.biz.id/shop/og-product-${p.id}.png`,
      sku: 'ZSTORE-' + String(p.id).padStart(4, '0'),
      brand: { '@type': 'Brand', name: 'Z Store' },
      category: p.category,
      offers: {
        '@type': 'Offer',
        url: `https://zcus.biz.id/shop/?ref=share&p=${p.id}`,
        priceCurrency: 'IDR',
        price: p.price,
        availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: p.seller_name || 'Z Store Official' }
      },
      aggregateRating: review_count > 0 ? {
        '@type': 'AggregateRating',
        ratingValue: Number(review_avg).toFixed(1),
        reviewCount: review_count
      } : undefined
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ CATEGORIES (distinct) ============
function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80);
}

app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT category, COUNT(*) as count FROM products WHERE status = 'active' GROUP BY category ORDER BY count DESC");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ PROMOS (active codes) ============
app.get('/api/promos', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT code, type, value, min_order, max_uses, used_count, expires_at, label FROM promo_codes WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW())");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ PRODUCTS (slug) ============
app.get('/api/products/slug/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const [all] = await pool.query("SELECT id, name FROM products WHERE status = 'active'");
    const match = all.find(p => slugify(p.name) === slug);
    if (!match) return res.status(404).json({ error: 'not found' });
    req.params.id = match.id;
    return app._router.handle({ ...req, url: '/api/products/' + match.id }, res, () => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT p.*, u.name as seller_name, u.id as seller_id, u.linked_telegram_id as seller_tg FROM products p JOIN users u ON p.seller_id = u.id WHERE p.id = ?',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    const [[{ stock }]] = await pool.query('SELECT COUNT(*) as stock FROM product_inventory WHERE product_id = ? AND status = ?', [req.params.id, 'available']);
    const [[reviewStats]] = await pool.query('SELECT COUNT(*) as count, COALESCE(AVG(rating), 0) as avg FROM reviews WHERE product_id = ?', [req.params.id]);
    const userId = req.user?.id || null;
    await pool.query('INSERT INTO product_views (product_id, user_id, source) VALUES (?, ?, ?)', [req.params.id, userId, 'web']);
    res.json({ ...rows[0], available: stock, review_count: reviewStats.count, review_avg: Number(reviewStats.avg).toFixed(1) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  const { name, description, category, price, original_price, emoji, type, stock } = req.body;
  if (!name || !category || !price) return res.status(400).json({ error: 'name, category, price required' });
  try {
    const [r] = await pool.query(
      'INSERT INTO products (seller_id, name, description, category, price, original_price, emoji, type, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, name, description || '', category, price, original_price || null, emoji || '📦', type || 'digital', stock || 0]
    );
    res.json({ id: r.insertId, message: 'product created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const [p] = await pool.query('SELECT seller_id FROM products WHERE id = ?', [req.params.id]);
    if (!p[0]) return res.status(404).json({ error: 'not found' });
    if (p[0].seller_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'not your product' });
    const fields = ['name','description','category','price','original_price','emoji','type','stock','status'];
    const updates = [];
    const args = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = ?`); args.push(req.body[f]); }
    }
    if (!updates.length) return res.json({ message: 'no changes' });
    args.push(req.params.id);
    await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, args);
    res.json({ message: 'updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const [p] = await pool.query('SELECT seller_id FROM products WHERE id = ?', [req.params.id]);
    if (!p[0]) return res.status(404).json({ error: 'not found' });
    if (p[0].seller_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'not your product' });
    await pool.query('UPDATE products SET status = ? WHERE id = ?', ['archived', req.params.id]);
    res.json({ message: 'archived' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products/:id/inventory', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required' });
  try {
    const [p] = await pool.query('SELECT seller_id FROM products WHERE id = ?', [req.params.id]);
    if (!p[0]) return res.status(404).json({ error: 'product not found' });
    if (p[0].seller_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'not your product' });
    const values = items.map(it => [req.params.id, it.mail || null, it.pass || null, it.two_fa || null, it.tutorial || null]);
    await pool.query('INSERT INTO product_inventory (product_id, mail, pass, two_fa, tutorial) VALUES ?', [values]);
    await pool.query('UPDATE products SET stock = (SELECT COUNT(*) FROM product_inventory WHERE product_id = ? AND status = ?) WHERE id = ?', [req.params.id, 'available', req.params.id]);
    res.json({ added: items.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ REVIEWS ============
app.get('/api/products/:id/reviews', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT r.*, u.name, u.avatar_url FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.product_id = ? ORDER BY r.created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products/:id/reviews', authMiddleware, async (req, res) => {
  const { rating, text } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating 1-5 required' });
  // Check if user bought this product
  const [orders] = await pool.query(
    `SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status IN ('paid','delivered') LIMIT 1`,
    [req.user.id, req.params.id]
  );
  if (!orders[0] && req.user.role !== 'admin') return res.status(403).json({ error: 'must purchase before review' });
  try {
    const [r] = await pool.query('INSERT INTO reviews (product_id, user_id, rating, text) VALUES (?, ?, ?, ?)', [req.params.id, req.user.id, rating, text || '']);
    res.json({ id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ ORDERS ============
app.post('/api/orders/checkout', authMiddleware, async (req, res) => {
  const { items, buyer_email, buyer_phone, source } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });
  if (!buyer_email) return res.status(400).json({ error: 'buyer_email required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    const productIds = items.map(i => i.product_id);
    const [products] = await conn.query(`SELECT id, price, stock, name FROM products WHERE id IN (?) AND status = 'active' FOR UPDATE`, [productIds]);
    const prodMap = new Map(products.map(p => [p.id, p]));
    for (const it of items) {
      const p = prodMap.get(it.product_id);
      if (!p) throw new Error(`product ${it.product_id} not available`);
      if (p.stock < it.qty) throw new Error(`product ${it.product_id} insufficient stock`);
      total += p.price * it.qty;
    }
    const midtransOrderId = `ZCUS-${Date.now()}-${req.user.id}`;
    const [orderRes] = await conn.query('INSERT INTO orders (buyer_id, total, status, midtrans_order_id, buyer_email, buyer_phone) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, total, 'pending', midtransOrderId, buyer_email, buyer_phone || null]);
    const orderId = orderRes.insertId;
    const orderItems = items.map(it => [orderId, it.product_id, it.qty, prodMap.get(it.product_id).price]);
    await conn.query('INSERT INTO order_items (order_id, product_id, qty, price) VALUES ?', [orderItems]);
    await conn.commit();

    // Send order to user across platforms
    await sendNotification(req.user.id, 'order', 'Order dibuat', `Order #${orderId} total ${total.toLocaleString('id-ID')}. Selesaikan pembayaran.`);

    const snapRes = await snap.createTransaction({
      transaction_details: { order_id: midtransOrderId, gross_amount: total },
      customer_details: { email: buyer_email, first_name: req.user.name || 'Buyer' },
      item_details: items.map(it => ({ id: String(it.product_id), price: prodMap.get(it.product_id).price, quantity: it.qty, name: prodMap.get(it.product_id).name?.slice(0, 50) || 'Product' })),
      enabled_payments: ['credit_card','bca_va','bni_va','bri_va','gopay','shopeepay','qris','other_va','indomaret','alfamart']
    });
    await pool.query('UPDATE orders SET midtrans_token = ? WHERE id = ?', [snapRes.token, orderId]);
    res.json({ order_id: orderId, midtrans_order_id: midtransOrderId, snap_token: snapRes.token, total });
  } catch (e) { await conn.rollback(); res.status(500).json({ error: e.message }); }
  finally { conn.release(); }
});
app.post('/api/orders/notification', async (req, res) => {
  try {
    const notif = req.body;
    const statusResponse = await snap.transaction.notification(notif);
    const orderId = statusResponse.order_id;
    const txStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    if (txStatus === 'capture' || (txStatus === 'settlement' && (!fraudStatus || fraudStatus === 'accept'))) {
      const [orders] = await pool.query('SELECT * FROM orders WHERE midtrans_order_id = ?', [orderId]);
      const order = orders[0];
      if (order && order.status === 'pending') {
        await pool.query('UPDATE orders SET status = ?, paid_at = NOW(), payment_type = ? WHERE id = ?', ['paid', statusResponse.payment_type, order.id]);
        const [items] = await pool.query('SELECT product_id, qty FROM order_items WHERE order_id = ?', [order.id]);

        // Hold inventory
        for (const it of items) {
          for (let i = 0; i < it.qty; i++) {
            const [inv] = await pool.query('SELECT id FROM product_inventory WHERE product_id = ? AND status = ? ORDER BY id ASC LIMIT 1', [it.product_id, 'available']);
            if (inv[0]) await pool.query('UPDATE product_inventory SET status = ?, order_id = ? WHERE id = ?', ['reserved', order.id, inv[0].id]);
          }
        }

        // Update sold count
        await pool.query('UPDATE products p SET sold = sold + (SELECT SUM(qty) FROM order_items WHERE order_id = ?) WHERE p.id IN (SELECT product_id FROM order_items WHERE order_id = ?)', [order.id, order.id]);

        // ESCROW: per-seller hold
        const [escrows] = await pool.query(`
          SELECT oi.product_id, oi.qty, oi.price, p.seller_id
          FROM order_items oi JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = ?
        `, [order.id]);
        const sellerTotals = {};
        for (const e of escrows) {
          sellerTotals[e.seller_id] = (sellerTotals[e.seller_id] || 0) + (e.price * e.qty);
        }
        const [escCfg] = await pool.query('SELECT * FROM escrow_config WHERE id = 1');
        const cfg = escCfg[0] || { default_days: 7, platform_fee_percent: 5, payment_fee_percent: 2.9 };
        const releaseAt = new Date(Date.now() + cfg.default_days * 86400000);

        for (const [sellerId, gross] of Object.entries(sellerTotals)) {
          const platformFee = Math.floor(gross * cfg.platform_fee_percent / 100);
          const paymentFee = Math.floor(gross * cfg.payment_fee_percent / 100);
          const sellerAmount = gross - platformFee - paymentFee;

          await pool.query(`INSERT IGNORE INTO escrow_holds (order_id, seller_id, amount, seller_amount, platform_fee, payment_fee, status, release_at) VALUES (?, ?, ?, ?, ?, ?, 'held', ?)`, [order.id, parseInt(sellerId), gross, sellerAmount, platformFee, paymentFee, releaseAt]);

          // Update seller balance: add to pending
          await pool.query(`INSERT INTO seller_balances (user_id, pending, total_earned) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE pending = pending + VALUES(pending), total_earned = total_earned + VALUES(total_earned)`, [parseInt(sellerId), sellerAmount, sellerAmount]);

          // Log transaction
          await pool.query(`INSERT INTO transactions (user_id, type, amount, reference_type, reference_id, description) VALUES (?, 'sale', ?, 'order', ?, ?)`, [parseInt(sellerId), sellerAmount, order.id, `Order #${order.id}`]);
        }

        // Auto-release escrow if older than X days (run async)
        releaseEscrow();

        await deliverOrder(order.id);
        await sendNotification(order.buyer_id, 'order', 'Pembayaran sukses', `Order #${order.id} sudah dibayar. Cek email untuk detail akun.`);
      }
      res.json({ status: 'ok' });
    } else if (txStatus === 'cancel' || txStatus === 'deny' || txStatus === 'expire') {
      await pool.query('UPDATE orders SET status = ? WHERE midtrans_order_id = ?', ['cancelled', orderId]);
      res.json({ status: 'ok' });
    } else { res.json({ status: 'pending' }); }
  } catch (e) { console.error('Webhook error:', e); res.status(500).json({ error: e.message }); }
});

// Auto-release escrow after X days
async function releaseEscrow() {
  try {
    const [holds] = await pool.query(`SELECT * FROM escrow_holds WHERE status = 'held' AND release_at <= NOW()`);
    for (const h of holds) {
      await pool.query('UPDATE escrow_holds SET status = ?, released_at = NOW() WHERE id = ?', ['released', h.id]);
      await pool.query('UPDATE seller_balances SET pending = pending - ?, available = available + ? WHERE user_id = ?', [h.seller_amount, h.seller_amount, h.seller_id]);
      await pool.query(`INSERT INTO transactions (user_id, type, amount, reference_type, reference_id, description) VALUES (?, 'sale', ?, 'order', ?, ?)`, [h.seller_id, h.seller_amount, h.order_id, `Escrow released: Order #${h.order_id}`]);
      await sendNotification(h.seller_id, 'escrow', 'Saldo released', `Rp ${Number(h.seller_amount).toLocaleString('id-ID')} dari order #${h.order_id} sudah masuk ke available balance.`);
    }
  } catch (e) { console.error('releaseEscrow:', e); }
}

async function deliverOrder(orderId) {
  try {
    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return;
    const [items] = await pool.query(`SELECT pi.*, p.name as product_name, p.category FROM product_inventory pi JOIN products p ON pi.product_id = p.id WHERE pi.order_id = ?`, [orderId]);
    if (!items.length) return;
    const lines = items.map(it => `\n━━━━━━━━━━━━━━━━━━━━\n📦 ${it.product_name}\nKategori: ${it.category}\n${it.mail ? `Email: ${it.mail}` : ''}\n${it.pass ? `Password: ${it.pass}` : ''}\n${it.two_fa ? `2FA: ${it.two_fa}` : ''}\n${it.tutorial ? `\n📝 Tutorial:\n${it.tutorial}` : ''}`).join('\n');
    const html = `<h2>Terima kasih atas pesanan Anda di Zcus Store!</h2><p>Order ID: <b>#${order.id}</b></p><p>Total: <b>Rp ${Number(order.total).toLocaleString('id-ID')}</b></p><p>Berikut adalah produk digital yang Anda beli:</p><pre style="background:#f5f5f5;padding:16px;border-radius:8px;font-family:monospace;">${lines}</pre><hr><p><small>Jaga kerahasiaan data ini.</small></p>`;
    try {
      await mailer.sendMail({ from: `"Zcus Store" <${process.env.GMAIL_USER || 'zcusgt@gmail.com'}>`, to: order.buyer_email, subject: `Pesanan Zcus #${order.id}`, html });
      await pool.query('UPDATE orders SET status = ?, delivered_at = NOW() WHERE id = ?', ['delivered', orderId]);
      await pool.query('UPDATE product_inventory SET status = ? WHERE order_id = ?', ['sold', orderId]);
      for (const it of items) {
        await pool.query('INSERT INTO deliveries (order_id, inventory_id, channel, recipient, status, sent_at) VALUES (?, ?, ?, ?, ?, NOW())', [orderId, it.id, 'email', order.buyer_email, 'sent']);
      }
    } catch (e) {
      console.error('Email failed:', e.message);
      for (const it of items) await pool.query('INSERT INTO deliveries (order_id, inventory_id, channel, recipient, status, error) VALUES (?, ?, ?, ?, ?, ?)', [orderId, it.id, 'email', order.buyer_email, 'failed', e.message]);
    }
  } catch (e) { console.error('deliverOrder:', e); }
}

app.get('/api/orders/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT o.*, GROUP_CONCAT(CONCAT(oi.qty, 'x ', p.name) SEPARATOR ', ') as items FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON oi.product_id = p.id WHERE o.buyer_id = ? GROUP BY o.id ORDER BY o.created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Order detail
app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!orders[0]) return res.status(404).json({ error: 'not found' });
    const o = orders[0];
    if (o.buyer_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const [items] = await pool.query(`SELECT oi.*, p.name, p.emoji, p.image_url, p.category FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [req.params.id]);
    const [deliveries] = await pool.query('SELECT * FROM deliveries WHERE order_id = ? ORDER BY sent_at DESC', [req.params.id]);
    const [escrow] = await pool.query('SELECT * FROM escrow_holds WHERE order_id = ?', [req.params.id]);
    res.json({ ...o, items, deliveries, escrow });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Buyer confirm delivery → release escrow early
app.post('/api/orders/:id/confirm-delivery', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!orders[0]) return res.status(404).json({ error: 'not found' });
    const o = orders[0];
    if (o.buyer_id !== req.user.id) return res.status(403).json({ error: 'not your order' });
    if (!['paid', 'delivered'].includes(o.status)) return res.status(400).json({ error: 'order not in confirmable state' });
    await pool.query('UPDATE orders SET status = ?, confirmed_at = NOW() WHERE id = ?', ['completed', req.params.id]);
    const [holds] = await pool.query("SELECT * FROM escrow_holds WHERE order_id = ? AND status = 'held'", [req.params.id]);
    for (const h of holds) {
      await pool.query("UPDATE escrow_holds SET status = ?, released_at = NOW() WHERE id = ?", ['released', h.id]);
      await pool.query('UPDATE seller_balances SET pending = pending - ?, available = available + ? WHERE user_id = ?', [h.seller_amount, h.seller_amount, h.seller_id]);
      await pool.query("INSERT INTO transactions (user_id, type, amount, reference_type, reference_id, description) VALUES (?, 'sale', ?, 'order', ?, ?)", [h.seller_id, h.seller_amount, h.order_id, `Buyer confirmed early: Order #${h.order_id}`]);
      await sendNotification(h.seller_id, 'escrow', 'Saldo released (buyer confirm)', `Rp ${Number(h.seller_amount).toLocaleString('id-ID')} dari order #${h.order_id} released.`);
    }
    res.json({ ok: true, released: holds.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ SELLER ============
app.get('/api/seller/dashboard', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const sellerId = req.user.id;
    const [stats] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'active') as products_count,
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'archived') as archived_count,
        (SELECT COALESCE(SUM(sold), 0) FROM products WHERE seller_id = ?) as total_sold,
        (SELECT COALESCE(SUM(amount), 0) FROM escrow_holds WHERE seller_id = ? AND status = 'released') as revenue_released,
        (SELECT COALESCE(SUM(amount), 0) FROM escrow_holds WHERE seller_id = ? AND status = 'held') as revenue_pending,
        (SELECT COUNT(*) FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id WHERE p.seller_id = ? AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as orders_30d
    `, [sellerId, sellerId, sellerId, sellerId, sellerId, sellerId]);
    const [balances] = await pool.query('SELECT * FROM seller_balances WHERE user_id = ?', [sellerId]);
    const [topProducts] = await pool.query('SELECT id, name, sold, price, stock FROM products WHERE seller_id = ? ORDER BY sold DESC LIMIT 5', [sellerId]);
    const [recentOrders] = await pool.query(`
      SELECT o.id, o.total, o.status, o.created_at, p.name as product_name
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE p.seller_id = ?
      ORDER BY o.created_at DESC LIMIT 10
    `, [sellerId]);
    const [escrowHolds] = await pool.query(`SELECT eh.*, o.buyer_email FROM escrow_holds eh JOIN orders o ON o.id = eh.order_id WHERE eh.seller_id = ? ORDER BY eh.held_at DESC LIMIT 10`, [sellerId]);
    const [recentTxns] = await pool.query(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`, [sellerId]);
    const [fees] = await pool.query(`SELECT * FROM service_fees WHERE active = TRUE`);
    res.json({ stats: stats[0], balance: balances[0] || { available: 0, pending: 0, total_earned: 0, total_withdrawn: 0 }, topProducts, recentOrders, escrowHolds, recentTxns, fees });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seller/products', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  const where = req.user.role === 'admin' ? '1=1' : 'seller_id = ?';
  const args = req.user.role === 'admin' ? [] : [req.user.id];
  try {
    const [rows] = await pool.query(`SELECT * FROM products WHERE ${where} ORDER BY created_at DESC`, args);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ WITHDRAWALS ============
app.post('/api/seller/withdraw', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  const { amount, method, destination, destination_name, bank_code, ewallet_type } = req.body;
  if (!amount || amount < 10000) return res.status(400).json({ error: 'Minimum withdraw Rp 10.000' });
  if (!['bank_transfer', 'ewallet'].includes(method)) return res.status(400).json({ error: 'Invalid method' });
  if (!destination) return res.status(400).json({ error: 'Destination required' });
  try {
    const [balances] = await pool.query('SELECT * FROM seller_balances WHERE user_id = ?', [req.user.id]);
    const available = balances[0]?.available || 0;
    const [fees] = await pool.query("SELECT fee_value FROM service_fees WHERE name = 'withdraw_fee' AND active = TRUE");
    const withdrawFee = fees[0]?.fee_value || 5000;
    if (amount + withdrawFee > available) return res.status(400).json({ error: `Saldo tidak cukup. Available: Rp ${Number(available).toLocaleString('id-ID')}, butuh: Rp ${Number(amount + withdrawFee).toLocaleString('id-ID')}` });
    const net = amount - withdrawFee;
    const [r] = await pool.query(`INSERT INTO withdrawals (user_id, amount, fee, net_amount, method, destination, destination_name, bank_code, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.user.id, amount, withdrawFee, net, method, destination, destination_name || null, bank_code || null, method === 'ewallet' ? `E-wallet: ${ewallet_type}` : null]);
    // Deduct from available
    await pool.query('UPDATE seller_balances SET available = available - ?, total_withdrawn = total_withdrawn + ? WHERE user_id = ?', [amount + withdrawFee, amount, req.user.id]);
    // Log transaction
    await pool.query(`INSERT INTO transactions (user_id, type, amount, reference_type, reference_id, description) VALUES (?, 'withdraw', ?, 'withdrawal', ?, ?)`, [req.user.id, -amount, r.insertId, `Withdraw request #${r.insertId}`]);
    await sendNotification(req.user.id, 'withdraw', 'Withdraw request', `Request withdraw Rp ${Number(amount).toLocaleString('id-ID')} sedang diproses.`);
    res.json({ id: r.insertId, message: 'Withdraw request created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seller/withdrawals', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Payout settings
app.get('/api/seller/payout-settings', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payout_settings WHERE user_id = ?', [req.user.id]);
    res.json(rows[0] || { auto_payout: false, min_payout: 50000, escrow_days: 7, preferred_method: 'bank_transfer' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/seller/payout-settings', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  const { auto_payout, min_payout, escrow_days, preferred_method } = req.body;
  try {
    await pool.query(`INSERT INTO payout_settings (user_id, auto_payout, min_payout, escrow_days, preferred_method) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE auto_payout = VALUES(auto_payout), min_payout = VALUES(min_payout), escrow_days = VALUES(escrow_days), preferred_method = VALUES(preferred_method)`, [req.user.id, !!auto_payout, min_payout || 50000, escrow_days || 7, preferred_method || 'bank_transfer']);
    res.json({ message: 'saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get transactions
app.get('/api/seller/transactions', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ ADMIN ============
app.get('/api/admin/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { role, search, limit = 100 } = req.query;
    let sql = 'SELECT id, email, name, role, created_at, linked_telegram_id, linked_whatsapp_number, linked_discord_id FROM users WHERE 1=1';
    const args = [];
    if (role) { sql += ' AND role = ?'; args.push(role); }
    if (search) { sql += ' AND (email LIKE ? OR name LIKE ?)'; args.push('%' + search + '%', '%' + search + '%'); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    args.push(parseInt(limit));
    const [rows] = await pool.query(sql, args);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id/role', authMiddleware, requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  if (!['buyer', 'seller', 'admin', 'cs', 'marketing'].includes(role)) return res.status(400).json({ error: 'invalid role' });
  try {
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'cannot delete self' });
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/orders', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    let sql = `SELECT o.*, u.name as buyer_name, u.email as buyer_email_account, GROUP_CONCAT(CONCAT(oi.qty, 'x ', p.name) SEPARATOR ', ') as items FROM orders o LEFT JOIN users u ON o.buyer_id = u.id LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON oi.product_id = p.id WHERE 1=1`;
    const args = [];
    if (status) { sql += ' AND o.status = ?'; args.push(status); }
    sql += ' GROUP BY o.id ORDER BY o.created_at DESC LIMIT ?';
    args.push(parseInt(limit));
    const [rows] = await pool.query(sql, args);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/products', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status, limit = 200 } = req.query;
    let sql = 'SELECT p.*, u.name as seller_name, u.email as seller_email FROM products p JOIN users u ON p.seller_id = u.id WHERE 1=1';
    const args = [];
    if (status) { sql += ' AND p.status = ?'; args.push(status); }
    sql += ' ORDER BY p.created_at DESC LIMIT ?';
    args.push(parseInt(limit));
    const [rows] = await pool.query(sql, args);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/withdrawals', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    let sql = `SELECT w.*, u.name as user_name, u.email as user_email FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE 1=1`;
    const args = [];
    if (status) { sql += ' AND w.status = ?'; args.push(status); }
    sql += ' ORDER BY w.created_at DESC LIMIT ?';
    args.push(parseInt(limit));
    const [rows] = await pool.query(sql, args);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/withdrawals/:id/approve', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [w] = await pool.query('SELECT * FROM withdrawals WHERE id = ?', [req.params.id]);
    if (!w[0]) return res.status(404).json({ error: 'not found' });
    if (w[0].status !== 'pending') return res.status(400).json({ error: `already ${w[0].status}` });
    await pool.query("UPDATE withdrawals SET status = 'completed', processed_at = NOW() WHERE id = ?", [req.params.id]);
    await sendNotification(w[0].user_id, 'withdraw', 'Withdraw disetujui', `Withdraw #${req.params.id} Rp ${Number(w[0].net_amount).toLocaleString('id-ID')} sudah ditransfer ke ${w[0].destination}.`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/withdrawals/:id/reject', authMiddleware, requireRole('admin'), async (req, res) => {
  const { reason } = req.body;
  try {
    const [w] = await pool.query('SELECT * FROM withdrawals WHERE id = ?', [req.params.id]);
    if (!w[0]) return res.status(404).json({ error: 'not found' });
    if (w[0].status !== 'pending') return res.status(400).json({ error: `already ${w[0].status}` });
    // Refund
    await pool.query('UPDATE seller_balances SET available = available + ?, total_withdrawn = total_withdrawn - ? WHERE user_id = ?', [w[0].amount + w[0].fee, w[0].amount, w[0].user_id]);
    await pool.query("UPDATE withdrawals SET status = 'rejected', processed_at = NOW(), notes = CONCAT(COALESCE(notes,''), ' | Rejected: ', ?) WHERE id = ?", [reason || 'no reason', req.params.id]);
    await pool.query("INSERT INTO transactions (user_id, type, amount, reference_type, reference_id, description) VALUES (?, 'refund', ?, 'withdrawal', ?, ?)", [w[0].user_id, w[0].amount + w[0].fee, w[0].id, `Withdraw rejected: ${reason || 'no reason'}`]);
    await sendNotification(w[0].user_id, 'withdraw', 'Withdraw ditolak', `Withdraw #${req.params.id} ditolak. Saldo sudah dikembalikan.${reason ? ' Alasan: ' + reason : ''}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/stats', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [u] = await pool.query('SELECT COUNT(*) as total, SUM(role="buyer") as buyers, SUM(role="seller") as sellers, SUM(role="admin") as admins, SUM(role="cs") as cs, SUM(role="marketing") as marketing FROM users');
    const [p] = await pool.query('SELECT COUNT(*) as total, SUM(stock>0) as in_stock, COALESCE(SUM(sold),0) as total_sold FROM products');
    const [o] = await pool.query('SELECT COUNT(*) as total, COALESCE(SUM(total),0) as revenue, SUM(status="pending") as pending, SUM(status="paid") as paid, SUM(status="delivered") as delivered, SUM(status="completed") as completed, SUM(status="cancelled") as cancelled FROM orders');
    const [m] = await pool.query('SELECT COALESCE(SUM(total),0) as revenue_30d, COUNT(*) as orders_30d FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    const [w] = await pool.query("SELECT COUNT(*) as pending, COALESCE(SUM(amount),0) as amount_pending FROM withdrawals WHERE status = 'pending'");
    const [e] = await pool.query("SELECT COUNT(*) as held, COALESCE(SUM(seller_amount),0) as amount_held FROM escrow_holds WHERE status = 'held'");
    res.json({ users: u[0], products: p[0], orders: o[0], month: m[0], withdrawals: w[0], escrow: e[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ INTEGRATIONS ============
app.get('/api/integrations', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM platform_integrations WHERE owner_id = ? ORDER BY platform', [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/integrations/telegram', authMiddleware, async (req, res) => {
  const { bot_token } = req.body;
  if (!bot_token) return res.status(400).json({ error: 'bot_token required' });
  try {
    // Verify bot token by calling getMe
    const verifyRes = await fetch(`https://api.telegram.org/bot${bot_token}/getMe`);
    const bot = await verifyRes.json();
    if (!bot.ok) return res.status(400).json({ error: 'invalid bot token', detail: bot.description });
    const config = JSON.stringify({ token: bot_token, bot_id: bot.result.id, bot_username: bot.result.username, bot_name: bot.result.first_name });
    await pool.query(`
      INSERT INTO platform_integrations (owner_id, platform, enabled, config, status)
      VALUES (?, 'telegram', TRUE, ?, 'active')
      ON DUPLICATE KEY UPDATE enabled = TRUE, config = VALUES(config), status = 'active', last_connected_at = NOW()
    `, [req.user.id, config]);
    res.json({ ok: true, bot: { id: bot.result.id, username: bot.result.username, name: bot.result.first_name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/integrations/whatsapp/qr', authMiddleware, async (req, res) => {
  try {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const [r] = await pool.query(`INSERT INTO whatsapp_sessions (user_id, session_id, status) VALUES (?, ?, 'waiting_qr')`, [req.user.id, sessionId]);
    // Real implementation: spawn wa-gateway subprocess that returns QR
    // For demo: return mock QR placeholder
    const qrPlaceholder = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=wa_session_${sessionId}`;
    await pool.query('UPDATE whatsapp_sessions SET qr_code = ? WHERE id = ?', [qrPlaceholder, r.insertId]);
    res.json({ session_id: sessionId, qr_url: qrPlaceholder, expires_in: 60 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/integrations/whatsapp/qr/:session', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM whatsapp_sessions WHERE session_id = ? AND user_id = ?', [req.params.session, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'session not found' });
    res.json({ status: rows[0].status, qr_url: rows[0].qr_code, phone: rows[0].phone_number });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/integrations/discord', authMiddleware, async (req, res) => {
  const { bot_token } = req.body;
  if (!bot_token) return res.status(400).json({ error: 'bot_token required' });
  try {
    const verifyRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: 'Bot ' + bot_token } });
    if (!verifyRes.ok) return res.status(400).json({ error: 'invalid bot token' });
    const bot = await verifyRes.json();
    const config = JSON.stringify({ token: bot_token, bot_id: bot.id, username: bot.username, discriminator: bot.discriminator });
    await pool.query(`
      INSERT INTO platform_integrations (owner_id, platform, enabled, config, status)
      VALUES (?, 'discord', TRUE, ?, 'active')
      ON DUPLICATE KEY UPDATE enabled = TRUE, config = VALUES(config), status = 'active', last_connected_at = NOW()
    `, [req.user.id, config]);
    res.json({ ok: true, bot: { id: bot.id, username: bot.username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/integrations/:platform', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM platform_integrations WHERE owner_id = ? AND platform = ?', [req.user.id, req.params.platform]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ NOTIFICATIONS ============
async function sendNotification(userId, type, title, body, link = null) {
  try {
    await pool.query('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)', [userId, type, title, body, link]);
    // Push to linked platforms
    const [u] = await pool.query('SELECT linked_telegram_id, linked_whatsapp_number, linked_discord_id FROM users WHERE id = ?', [userId]);
    if (u[0]) {
      // TODO: push to telegram bot, whatsapp gateway, discord bot
    }
  } catch (e) { console.error('sendNotification:', e); }
}

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    const [[{ unread }]] = await pool.query('SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ notifications: rows, unread });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ START ============
const RELEASE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
setInterval(releaseEscrow, RELEASE_INTERVAL_MS);
releaseEscrow(); // run once on boot

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Z Store API v5.0.0`);
  console.log(`Listening: http://127.0.0.1:${PORT}`);
  console.log(`NodeJS ${process.version}`);
  console.log(`Multi-platform: web + telegram + whatsapp + discord`);
  console.log(`Escrow auto-release: every ${RELEASE_INTERVAL_MS / 3600000}h`);
});

process.on('uncaughtException', (err) => console.error('UNCAUGHT:', err));
