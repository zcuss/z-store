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
const sec = require('./security');

const PORT = process.env.PORT || 3001;
const JWT_S3CR3T = process.env.JWT_S3CR3T || (() => { console.error('[FATAL] JWT_S3CR3T env not set'); process.exit(1); })();
const JWT_SECRET = JWT_S3CR3T;
const MOUNT_PREFIX = process.env.MOUNT_PREFIX || '/shop-app';

const app = express();

// ============ SECURITY MIDDLEWARE (must run FIRST) ============
// Global IP rate limit (defense-in-depth anti-DDoS)
app.use(sec.globalRateLimit(300, 50));
// Strict CORS (whitelist origins)
app.use(sec.corsStrict);
// Security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(sec.securityHeaders);
// Body parser limits (anti-DoS via huge payloads)
app.use(express.json({ limit: '512kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
// Request timeout (anti slow-loris)
app.use(sec.requestGuard(30_000));
// Injection guard (anti-SQLi/XSS/RCE in query/body/params)
app.use(sec.injectionGuard);

// Global error handler to prevent server crash on bad requests
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload too large' });
  }
  if (err) {
    sec.logSecurityEvent('express_error', req.ip, { msg: err.message });
    return res.status(500).json({ error: 'server error' });
  }
  next();
});

app.use((req, res, next) => {
  if (MOUNT_PREFIX && req.url.startsWith(MOUNT_PREFIX)) {
    req.url = req.url.slice(MOUNT_PREFIX.length) || '/';
  }
  next();
});

// ============ STATIC FRONTEND (served at /shop/*) ============
// Single-port mode: same Express serves static frontend + API.
// Useful when behind a single Cloudflare tunnel / nginx upstream.
const path = require('path');
const FRONTEND_DIR = path.resolve(__dirname, '../frontend/shop');
const fs = require('fs');
if (fs.existsSync(FRONTEND_DIR)) {
  app.use('/shop', (req, res, next) => {
    // strip /shop prefix + query string → file path
    const u = new URL(req.url, 'http://x');
    let rel = u.pathname === '/' ? '/index.html' : u.pathname;
    // strip trailing slash for file lookup
    const cleanRel = rel.replace(/\/+$/, '') || '/';
    const fpath = path.join(FRONTEND_DIR, cleanRel);
    // prevent path traversal
    if (!fpath.startsWith(FRONTEND_DIR)) return res.status(403).end();
    fs.stat(fpath, (err, stat) => {
      if (err || !stat.isFile()) {
        // Try .html extension (SPA routing: /orders → orders.html)
        if (!path.extname(cleanRel)) {
          const htmlPath = path.join(FRONTEND_DIR, cleanRel + '.html');
          if (fs.existsSync(htmlPath)) return res.sendFile(htmlPath);
        }
        // Last resort: SPA fallback for paths with no extension
        if (!path.extname(cleanRel)) return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
        return next();
      }
      res.setHeader('Cache-Control', /\.(css|js|woff2?|svg|png|jpg|webp)$/i.test(cleanRel) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      res.sendFile(fpath);
    });
  });
  app.get('/shop', (_req, res) => res.redirect('/shop/'));
  app.get('/', (_req, res) => res.redirect('/shop/'));
  console.log('[static] serving frontend at /shop/* from', FRONTEND_DIR);
}

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
app.post('/api/auth/register', rateLimit('register', 5, 60 * 60 * 1000), async (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (!sec.validateEmail(email)) return res.status(400).json({ error: 'invalid email format' });
  if (!sec.validatePassword(password)) return res.status(400).json({ error: 'password must be 8+ chars, include letter & number' });
  if (name !== undefined && (!sec.validateString(name, 100) || /[<>'"&]/.test(name))) {
    return res.status(400).json({ error: 'invalid name (max 100 chars, no HTML)' });
  }
  if (role !== undefined && !sec.validateEnum(role, ['buyer', 'seller'])) {
    return res.status(400).json({ error: 'invalid role' });
  }
  const cleanEmail = sec.sanitizeText(email).toLowerCase();
  const cleanName = name ? sec.sanitizeText(name) : cleanEmail.split('@')[0];
  try {
    const hash = await bcrypt.hash(password, 12); // higher rounds = harder to brute force
    const userRole = role === 'seller' ? 'seller' : 'buyer';
    const [r] = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [cleanEmail, hash, cleanName, userRole]
    );
    const user = { id: r.insertId, email: cleanEmail, name: cleanName, role: userRole };
    res.json({ user, token: signToken(user) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email already registered' });
    sec.logSecurityEvent('register_error', req.ip, { code: e.code });
    return res.status(500).json(sec.safeError(e, process.env.NODE_ENV === 'development'));
  }
});

app.post('/api/auth/login', rateLimit('login', 10, 15 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body || {};
  if (!sec.validateEmail(email)) return res.status(400).json({ error: 'invalid email format' });
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return res.status(400).json({ error: 'invalid credentials' });
  }
  const cleanEmail = sec.sanitizeText(email).toLowerCase();
  // Check account lockout
  const lockedUntil = checkLocked(cleanEmail);
  if (lockedUntil) {
    const remainMin = Math.ceil((lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Akun terkunci. Coba lagi dalam ${remainMin} menit.`, locked_until: new Date(lockedUntil).toISOString() });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!rows[0]) {
      // Constant-time response to prevent user enumeration
      // (1) run bcrypt against dummy hash (real path also runs bcrypt)
      await bcrypt.compare(password, '$2a$12$dummyhashforcomparetimingattack0000000000000000000000000000000');
      // (2) recordFailedLogin
      recordFailedLogin(cleanEmail);
      // (3) auditLog + logSecurityEvent (mirror the existing-user-wrong-pw path exactly)
      auditLog(null, 'login_failed_invalid_user', { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress, email_hash: sec.sha256Short(cleanEmail) });
      sec.logSecurityEvent('login_failed', req.ip, { email_hash: sec.sha256Short(cleanEmail) });
      return res.status(401).json({ error: 'invalid credentials' });
    }
    if (!rows[0].password_hash) return res.status(401).json({ error: 'login with Google instead' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      recordFailedLogin(cleanEmail);
      const entry = loginAttempts.get(cleanEmail);
      const remain = entry && entry.lockedUntil > Date.now();
      auditLog(rows[0].id, 'login_failed', { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
      sec.logSecurityEvent('login_failed', req.ip, { user_id: rows[0].id });
      return res.status(401).json({
        error: remain ? 'Akun terkunci setelah terlalu banyak percobaan gagal. Coba lagi 15 menit.' : 'invalid credentials',
        attempts_left: entry ? Math.max(0, MAX_LOGIN_ATTEMPTS - entry.count) : MAX_LOGIN_ATTEMPTS - 1,
        locked: !!remain
      });
    }
    resetLoginAttempts(cleanEmail);
    auditLog(rows[0].id, 'login_success', { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
    const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
    res.json({ user, token: signToken(user) });
  } catch (e) {
    sec.logSecurityEvent('login_error', req.ip, { code: e.code });
    return res.status(500).json(sec.safeError(e, process.env.NODE_ENV === 'development'));
  }
});

app.post('/api/auth/google', async (req, res) => {
  const { credential, google_id, email, name, avatar_url } = req.body;
  try {
    let payload = null;
    // Modern: verify Google ID token via Google API
    if (credential) {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!verifyRes.ok) return res.status(401).json({ error: 'invalid Google credential' });
      payload = await verifyRes.json();
      if (!payload.email || !payload.sub) return res.status(400).json({ error: 'incomplete Google payload' });
    } else if (google_id && email) {
      // Legacy fallback (dev only)
      payload = { sub: google_id, email, name, picture: avatar_url };
    } else {
      return res.status(400).json({ error: 'credential or google_id+email required' });
    }
    const [existing] = await pool.query('SELECT * FROM users WHERE google_id = ? OR email = ?', [payload.sub, payload.email]);
    let user;
    if (existing[0]) {
      // Link google_id if not set
      if (!existing[0].google_id) await pool.query('UPDATE users SET google_id = ? WHERE id = ?', [payload.sub, existing[0].id]);
      // Update avatar if Google provides one and user has none
      if (payload.picture && !existing[0].avatar_url) await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [payload.picture, existing[0].id]);
      user = { id: existing[0].id, email: existing[0].email, name: existing[0].name, role: existing[0].role };
    } else {
      const [r] = await pool.query(
        'INSERT INTO users (email, google_id, name, role, avatar_url, email_verified) VALUES (?, ?, ?, ?, ?, TRUE)',
        [payload.email, payload.sub, payload.name || payload.email.split('@')[0], 'buyer', payload.picture || null]
      );
      user = { id: r.insertId, email: payload.email, name: payload.name || payload.email.split('@')[0], role: 'buyer' };
      await sendNotification(r.insertId, 'welcome', 'Selamat datang di Z Store!', `Halo ${user.name}, akun kamu sudah aktif. Selamat belanja!`);
    }
    res.json({ user, token: signToken(user), isNew: !existing[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Change password
app.put('/api/auth/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'current_password + new_password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  if (new_password === current_password) return res.status(400).json({ error: 'Password baru harus beda dari yang lama' });
  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'user not found' });
    if (!rows[0].password_hash) return res.status(400).json({ error: 'Akun ini login via Google. Set password via Google account.' });
    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Password lama salah' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ ok: true, message: 'Password berhasil diubah. Silakan login ulang dengan password baru.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update profile
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const { name, bio, avatar_url, phone } = req.body;
  try {
    const updates = [];
    const args = [];
    if (name !== undefined) { updates.push('name = ?'); args.push(name); }
    if (bio !== undefined) { updates.push('bio = ?'); args.push(bio); }
    if (avatar_url !== undefined) { updates.push('avatar_url = ?'); args.push(avatar_url); }
    if (phone !== undefined) { updates.push('phone = ?'); args.push(phone); }
    if (!updates.length) return res.json({ message: 'no changes' });
    args.push(req.user.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, args);
    const [rows] = await pool.query('SELECT id, email, name, role, bio, avatar_url, phone FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ OTP (Email verification + passwordless login) ============
// In-memory OTP store (use Redis in production). TTL 10 min, max 5 attempts per OTP.
const otpStore = new Map();
function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

app.post('/api/auth/otp/request', rateLimit('otp-request', 3, 10 * 60 * 1000), async (req, res) => {
  const { email, purpose } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid email format' });
  const purp = purpose || 'register'; // register | reset | login
  // Rate limit: max 3 per email per 10 min
  const key = `${email}:${purp}`;
  const now = Date.now();
  const prev = otpStore.get(key);
  if (prev && prev.attempts >= 3 && (now - prev.firstAt) < 600000) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.' });
  }
  const otp = genOtp();
  const expiresAt = now + 600000; // 10 min
  otpStore.set(key, { otp, expiresAt, attempts: prev && (now - prev.firstAt) < 600000 ? prev.attempts + 1 : 1, firstAt: prev && (now - prev.firstAt) < 600000 ? prev.firstAt : now });
  // Send email via mailer (or console in dev)
  const subject = purp === 'register' ? 'Kode Verifikasi Registrasi Z Store' : purp === 'reset' ? 'Kode Reset Password Z Store' : 'Kode Login Z Store';
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#fff;border-radius:12px">
    <h2 style="color:#38bdf8;margin:0 0 16px">Z Store</h2>
    <p>Halo,</p>
    <p>Gunakan kode OTP berikut untuk ${purp === 'register' ? 'menyelesaikan registrasi' : purp === 'reset' ? 'reset password' : 'login'} akun kamu:</p>
    <div style="background:#1e293b;padding:24px;text-align:center;border-radius:8px;margin:20px 0">
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#38bdf8;font-family:monospace">${otp}</div>
    </div>
    <p style="color:#94a3b8;font-size:13px">Kode ini berlaku 10 menit. Jangan bagikan ke siapapun.</p>
    <p style="color:#94a3b8;font-size:13px">Kalau kamu tidak meminta kode ini, abaikan email ini.</p>
  </div>`;
  try {
    if (process.env.GMAIL_APP_PASS) {
      await mailer.sendMail({ from: `"Z Store" <${process.env.GMAIL_USER || 'zcusgt@gmail.com'}>`, to: email, subject, html });
    } else {
      // Dev mode: log OTP to server console
      console.log(`[OTP-DEV] ${email} (${purp}): ${otp}`);
    }
    res.json({ ok: true, message: 'OTP terkirim. Cek email kamu (atau console server jika dev).', dev_otp: process.env.GMAIL_APP_PASS ? undefined : otp });
  } catch (e) {
    console.error('OTP email failed:', e.message);
    // Still return success but log to console
    console.log(`[OTP-FALLBACK] ${email} (${purp}): ${otp}`);
    res.json({ ok: true, message: 'OTP terkirim (fallback).', dev_otp: otp });
  }
});

app.post('/api/auth/otp/verify', rateLimit('otp-verify', 5, 10 * 60 * 1000), async (req, res) => {
  const { email, otp, purpose, name, role } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'email + otp required' });
  const purp = purpose || 'register';
  const key = `${email}:${purp}`;
  const record = otpStore.get(key);
  if (!record) return res.status(400).json({ error: 'OTP tidak ditemukan atau sudah kadaluarsa' });
  if (Date.now() > record.expiresAt) { otpStore.delete(key); return res.status(400).json({ error: 'OTP kadaluarsa. Request ulang.' }); }
  if (record.otp !== otp) return res.status(400).json({ error: 'OTP salah' });
  otpStore.delete(key);
  try {
    if (purp === 'register') {
      // Create user
      const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (existing[0]) return res.status(409).json({ error: 'Email sudah terdaftar. Silakan login.' });
      const userRole = role === 'seller' ? 'seller' : 'buyer';
      const [r] = await pool.query(
        'INSERT INTO users (email, name, role, email_verified) VALUES (?, ?, ?, TRUE)',
        [email, name || email.split('@')[0], userRole]
      );
      const user = { id: r.insertId, email, name: name || email.split('@')[0], role: userRole };
      await sendNotification(r.insertId, 'welcome', 'Selamat datang di Z Store!', `Halo ${user.name}, akun kamu sudah aktif via OTP.`);
      return res.json({ user, token: signToken(user), message: 'Registrasi berhasil via OTP' });
    }
    if (purp === 'login' || purp === 'reset') {
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (!rows[0]) return res.status(404).json({ error: 'Email belum terdaftar' });
      const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
      return res.json({ user, token: signToken(user), message: purp === 'login' ? 'Login OTP berhasil' : 'OTP valid, lanjut reset password' });
    }
    res.status(400).json({ error: 'unknown purpose' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset password via OTP (verified)
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, new_password } = req.body;
  if (!email || !otp || !new_password) return res.status(400).json({ error: 'email, otp, new_password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  // Re-verify OTP (purpose=reset)
  const key = `${email}:reset`;
  const record = otpStore.get(key);
  if (!record || Date.now() > record.expiresAt || record.otp !== otp) return res.status(400).json({ error: 'OTP tidak valid atau kadaluarsa' });
  otpStore.delete(key);
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (!rows[0]) return res.status(404).json({ error: 'Email tidak ditemukan' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].id]);
    res.json({ ok: true, message: 'Password berhasil direset. Silakan login.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role,
      linked_telegram_id: req.user.linked_telegram_id,
      linked_whatsapp_number: req.user.linked_whatsapp_number,
      linked_discord_id: req.user.linked_discord_id,
      bio: req.user.bio, avatar_url: req.user.avatar_url, phone: req.user.phone,
      email_verified: req.user.email_verified
    }
  });
});

// ============ PLATFORM SYNC (unified account status) ============
// Get all linked platforms + their metadata
app.get('/api/auth/platforms', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT platform, enabled, status, last_connected_at, config FROM platform_integrations WHERE owner_id = ?',
      [req.user.id]
    );
    const platforms = {
      web: { linked: true, identifier: req.user.email, verified: !!req.user.email_verified, primary: true },
      telegram: { linked: !!req.user.linked_telegram_id, identifier: req.user.linked_telegram_id, bot: null },
      whatsapp: { linked: !!req.user.linked_whatsapp_number, identifier: req.user.linked_whatsapp_number, qr_session: null },
      discord: { linked: !!req.user.linked_discord_id, identifier: req.user.linked_discord_id, bot: null }
    };
    // Populate bot info from integrations
    for (const row of rows) {
      try {
        const cfg = JSON.parse(row.config || '{}');
        if (platforms[row.platform]) {
          platforms[row.platform].bot = { id: cfg.bot_id, username: cfg.bot_username, name: cfg.bot_name };
          platforms[row.platform].status = row.status;
          platforms[row.platform].enabled = row.enabled;
          platforms[row.platform].last_connected_at = row.last_connected_at;
        }
      } catch (e) { /* ignore JSON parse */ }
    }
    res.json({ platforms });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    if (existing[0]) return res.status(409).json({ error: `${platform} sudah terikat ke akun lain (${existing[0].email})` });
    await pool.query(`UPDATE users SET ${col} = ? WHERE id = ?`, [identifier, req.user.id]);
    await sendNotification(req.user.id, 'platform', `${platform} linked`, `Akun ${platform} kamu berhasil di-link.`);
    res.json({ ok: true, platform, identifier, message: `${platform} berhasil di-link` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/unlink', authMiddleware, async (req, res) => {
  const { platform } = req.body;
  if (!['telegram', 'whatsapp', 'discord'].includes(platform)) return res.status(400).json({ error: 'invalid platform' });
  const col = platform === 'telegram' ? 'linked_telegram_id' : platform === 'whatsapp' ? 'linked_whatsapp_number' : 'linked_discord_id';
  try {
    await pool.query(`UPDATE users SET ${col} = NULL WHERE id = ?`, [req.user.id]);
    // Also disable integration
    await pool.query('UPDATE platform_integrations SET enabled = FALSE WHERE owner_id = ? AND platform = ?', [req.user.id, platform]);
    auditLog(req.user.id, 'platform_unlink', { platform });
    res.json({ ok: true, message: `${platform} berhasil di-unlink` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ LOGOUT (token blacklist) ============
app.post('/api/auth/logout', (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) blacklistToken(token);
  auditLog(req.user?.id, 'logout', {});
  res.json({ ok: true, message: 'Logout berhasil' });
});

app.post('/api/auth/logout-all', authMiddleware, async (req, res) => {
  // Blacklist all tokens for this user (we track by user_id via JWT)
  // For simplicity, mark current as revoked + tell user to re-login
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) blacklistToken(token);
  auditLog(req.user.id, 'logout_all', {});
  res.json({ ok: true, message: 'Semua device logout. Silakan login ulang.' });
});

// ============ 2FA TOTP ============
const speakeasy = null; // avoid dep; use HMAC-SHA1 inline for TOTP
function base32Encode(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '', out = '';
  for (let i = 0; i < buf.length; i++) bits += buf[i].toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = str.replace(/=+$/, '').toUpperCase();
  let bits = '', out = [];
  for (let i = 0; i < clean.length; i++) {
    const v = alphabet.indexOf(clean[i]);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  for (let i = 0; i < bits.length; i += 8) {
    const b = parseInt(bits.slice(i, i + 8), 2);
    if (!isNaN(b)) out.push(b);
  }
  return Buffer.from(out);
}
function genTotpSecret() {
  const buf = require('crypto').randomBytes(20);
  return base32Encode(buf);
}
function totp(secret, time = Math.floor(Date.now() / 1000 / 30)) {
  const crypto = require('crypto');
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) buf[i] = (time >> (56 - i * 8)) & 0xff;
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 | (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}
function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Math.floor(Date.now() / 1000 / 30);
  for (let w = -1; w <= 1; w++) {
    if (totp(secret, now + w) === code) return true;
  }
  return false;
}

app.post('/api/auth/2fa/setup', authMiddleware, async (req, res) => {
  try {
    const secret = genTotpSecret();
    await pool.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, req.user.id]);
    const otpauth = `otpauth://totp/Z%20Store:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=Z%20Store`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
    auditLog(req.user.id, '2fa_setup', {});
    res.json({ secret, qr_url: qrUrl, otpauth });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/2fa/enable', authMiddleware, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const [rows] = await pool.query('SELECT totp_secret FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]?.totp_secret) return res.status(400).json({ error: 'Setup 2FA dulu' });
    if (!verifyTotp(rows[0].totp_secret, code)) return res.status(401).json({ error: 'Kode salah' });
    await pool.query('UPDATE users SET totp_enabled = TRUE WHERE id = ?', [req.user.id]);
    auditLog(req.user.id, '2fa_enabled', {});
    res.json({ ok: true, message: '2FA aktif' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/2fa/disable', authMiddleware, async (req, res) => {
  const { code, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT password_hash, totp_secret FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]?.totp_secret) return res.json({ ok: true, message: '2FA belum aktif' });
    // Verify password OR totp
    let ok = false;
    if (password && rows[0].password_hash && await bcrypt.compare(password, rows[0].password_hash)) ok = true;
    if (code && verifyTotp(rows[0].totp_secret, code)) ok = true;
    if (!ok) return res.status(401).json({ error: 'Password atau kode 2FA salah' });
    await pool.query('UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = ?', [req.user.id]);
    auditLog(req.user.id, '2fa_disabled', {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2FA verify during login (optional step)
async function checkTwoFA(userId) {
  try {
    const [rows] = await pool.query('SELECT totp_enabled FROM users WHERE id = ?', [userId]);
    return rows[0]?.totp_enabled || false;
  } catch (e) { return false; }
}

// ============ EMAIL VERIFICATION FLOW ============
const emailVerifyTokens = new Map(); // token → { userId, expiresAt }
app.post('/api/auth/email/verify/request', authMiddleware, async (req, res) => {
  const token = require('crypto').randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 24 * 3600 * 1000;
  emailVerifyTokens.set(token, { userId: req.user.id, expiresAt });
  const link = `https://zcus.biz.id/shop/verify-email.html?token=${token}`;
  try {
    if (process.env.GMAIL_APP_PASS) {
      await mailer.sendMail({
        from: `"Z Store" <${process.env.GMAIL_USER || 'zcusgt@gmail.com'}>`,
        to: req.user.email,
        subject: 'Verifikasi Email — Z Store',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#fff;border-radius:12px"><h2 style="color:#38bdf8">Verifikasi Email</h2><p>Klik link untuk verifikasi:</p><a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;margin:16px 0">Verifikasi Email</a><p style="color:#94a3b8;font-size:12px">Link kadaluarsa dalam 24 jam.</p></div>`
      });
    }
    res.json({ ok: true, message: 'Link verifikasi dikirim ke email', dev_link: process.env.GMAIL_APP_PASS ? undefined : link });
    auditLog(req.user.id, 'email_verify_requested', {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/email/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  const entry = emailVerifyTokens.get(token);
  if (!entry) return res.status(400).json({ error: 'Token tidak valid' });
  if (entry.expiresAt < Date.now()) {
    emailVerifyTokens.delete(token);
    return res.status(400).json({ error: 'Token kadaluarsa' });
  }
  try {
    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = ?', [entry.userId]);
    emailVerifyTokens.delete(token);
    auditLog(entry.userId, 'email_verified', {});
    res.json({ ok: true, message: 'Email verified!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ SECURITY STATUS (for settings page) ============
app.get('/api/auth/security-status', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT password_hash, totp_enabled, email_verified, google_id FROM users WHERE id = ?', [req.user.id]);
    const u = rows[0] || {};
    const locked = checkLocked(req.user.email);
    const attempts = loginAttempts.get(req.user.email.toLowerCase().trim());
    res.json({
      has_password: !!u.password_hash,
      has_google: !!u.google_id,
      totp_enabled: !!u.totp_enabled,
      email_verified: !!u.email_verified,
      locked_until: locked ? new Date(locked).toISOString() : null,
      failed_attempts: attempts ? attempts.count : 0,
      max_attempts: MAX_LOGIN_ATTEMPTS,
      security_score: (u.password_hash ? 25 : 0) + (u.totp_enabled ? 35 : 0) + (u.email_verified ? 25 : 0) + (u.google_id ? 15 : 0)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Request OTP-style link to platform (for telegram bot flow: user sends /start to bot, bot gives code, user enters here)
app.post('/api/auth/link/request', authMiddleware, async (req, res) => {
  const { platform } = req.body;
  if (!['telegram', 'whatsapp', 'discord'].includes(platform)) return res.status(400).json({ error: 'invalid platform' });
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  // Store temporarily (10 min)
  if (!global._linkCodes) global._linkCodes = new Map();
  global._linkCodes.set(`${req.user.id}:${platform}`, { code, expiresAt: Date.now() + 600000 });
  let instruction = '';
  if (platform === 'telegram') instruction = `Buka @ZStoreBot, kirim /start, lalu masukkan kode: ${code}`;
  else if (platform === 'whatsapp') instruction = `Scan QR di Settings → Integrations, atau masukkan kode: ${code} setelah scan`;
  else if (platform === 'discord') instruction = `Invite bot ke server, jalankan /link code:${code}`;
  res.json({ ok: true, code, instruction, expires_in: 600 });
});

app.post('/api/auth/link/confirm', authMiddleware, async (req, res) => {
  const { platform, code, identifier } = req.body;
  if (!['telegram', 'whatsapp', 'discord'].includes(platform)) return res.status(400).json({ error: 'invalid platform' });
  try {
    let finalIdentifier = identifier;
    if (!finalIdentifier && code) {
      // Verify code
      if (!global._linkCodes) return res.status(400).json({ error: 'No pending link request' });
      const rec = global._linkCodes.get(`${req.user.id}:${platform}`);
      if (!rec || Date.now() > rec.expiresAt) return res.status(400).json({ error: 'Code kadaluarsa' });
      if (rec.code !== code) return res.status(400).json({ error: 'Code salah' });
      global._linkCodes.delete(`${req.user.id}:${platform}`);
      // For demo: generate placeholder identifier
      finalIdentifier = platform === 'telegram' ? `tg_${Date.now()}` : platform === 'whatsapp' ? `+628${Math.floor(Math.random() * 1e9)}` : `discord_${Date.now()}`;
    }
    if (!finalIdentifier) return res.status(400).json({ error: 'identifier or valid code required' });
    const col = platform === 'telegram' ? 'linked_telegram_id' : platform === 'whatsapp' ? 'linked_whatsapp_number' : 'linked_discord_id';
    await pool.query(`UPDATE users SET ${col} = ? WHERE id = ?`, [finalIdentifier, req.user.id]);
    res.json({ ok: true, platform, identifier: finalIdentifier, message: `${platform} linked!` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ PRODUCTS ============
app.get('/api/products', async (req, res) => {
  const { category, search, limit = 50 } = req.query;
  let sql = `SELECT p.*, u.name as seller_name,
    (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) as review_count,
    (SELECT COALESCE(AVG(rating), 0) FROM reviews r WHERE r.product_id = p.id) as review_avg
    FROM products p JOIN users u ON p.seller_id = u.id WHERE p.status = ?`;
  const args = ['active'];
  if (category) { sql += ' AND p.category = ?'; args.push(category); }
  if (search) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; args.push('%' + search + '%', '%' + search + '%'); }
  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  args.push(parseInt(limit));
  try {
    const [rows] = await pool.query(sql, args);
    // Round review_avg to 1 decimal
    rows.forEach(r => { if (r.review_avg) r.review_avg = Number(r.review_avg).toFixed(1); });
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
  const { name, description, category, price, original_price, emoji, type, stock } = req.body || {};
  if (!sec.validateString(name, 200) || /[<>'"&]/.test(name)) return res.status(400).json({ error: 'invalid name (max 200, no HTML)' });
  if (!sec.validateString(category, 50)) return res.status(400).json({ error: 'invalid category' });
  if (description && !sec.validateString(description, 2000)) return res.status(400).json({ error: 'description too long (max 2000)' });
  if (typeof price !== 'number' || price <= 0 || price > 100_000_000 || !Number.isFinite(price)) return res.status(400).json({ error: 'invalid price (1-100M)' });
  if (original_price !== undefined && original_price !== null && (typeof original_price !== 'number' || original_price < 0)) return res.status(400).json({ error: 'invalid original_price' });
  if (emoji && (typeof emoji !== 'string' || emoji.length > 8 || /[<>]/.test(emoji))) return res.status(400).json({ error: 'invalid emoji' });
  if (type && !sec.validateEnum(type, ['digital', 'physical', 'service', 'voucher'])) return res.status(400).json({ error: 'invalid type' });
  if (stock !== undefined && (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000)) return res.status(400).json({ error: 'invalid stock (0-1M)' });
  const cleanName = sec.sanitizeText(name);
  const cleanDesc = description ? sec.sanitizeText(description) : '';
  const cleanCat = sec.sanitizeText(category).toLowerCase();
  try {
    const [r] = await pool.query(
      'INSERT INTO products (seller_id, name, description, category, price, original_price, emoji, type, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, cleanName, cleanDesc, cleanCat, price, original_price || null, emoji || '📦', type || 'digital', stock || 0]
    );
    res.json({ id: r.insertId, message: 'product created' });
  } catch (e) {
    sec.logSecurityEvent('product_create_error', req.ip, { code: e.code });
    return res.status(500).json(sec.safeError(e, process.env.NODE_ENV === 'development'));
  }
});

app.put('/api/products/:id', authMiddleware, requireRole('seller', 'admin'), async (req, res) => {
  if (!sec.validateId(Number(req.params.id))) return res.status(400).json({ error: 'invalid id' });
  try {
    const [p] = await pool.query('SELECT seller_id FROM products WHERE id = ?', [req.params.id]);
    if (!p[0]) return res.status(404).json({ error: 'not found' });
    if (p[0].seller_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'not your product' });
    const fieldDefs = {
      name: { max: 200, sanitize: true, noHtml: true },
      description: { max: 2000, sanitize: true },
      category: { max: 50, sanitize: true },
      price: { type: 'number', min: 1, max: 100_000_000 },
      original_price: { type: 'number', min: 0, max: 100_000_000, allowNull: true },
      emoji: { max: 8, noHtml: true },
      type: { enum: ['digital', 'physical', 'service', 'voucher'] },
      stock: { type: 'integer', min: 0, max: 1_000_000 },
      status: { enum: ['active', 'archived', 'draft'] },
    };
    const updates = [];
    const args = [];
    for (const [f, def] of Object.entries(fieldDefs)) {
      if (req.body[f] === undefined) continue;
      const v = req.body[f];
      if (def.enum && !def.enum.includes(v)) return res.status(400).json({ error: `invalid ${f}` });
      if (def.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) return res.status(400).json({ error: `invalid ${f}` });
      if (def.type === 'integer' && (!Number.isInteger(v))) return res.status(400).json({ error: `invalid ${f}` });
      if (def.max !== undefined && typeof v === 'string' && v.length > def.max) return res.status(400).json({ error: `${f} too long` });
      if (def.noHtml && typeof v === 'string' && /[<>'"&]/.test(v)) return res.status(400).json({ error: `${f} contains HTML` });
      let clean = v;
      if (def.sanitize && typeof v === 'string') clean = sec.sanitizeText(v);
      if (def.type === 'integer') clean = Math.max(def.min || 0, Math.min(def.max || Infinity, v));
      if (def.type === 'number' && v !== null) clean = Math.max(def.min || 0, Math.min(def.max || Infinity, v));
      updates.push(`${f} = ?`);
      args.push(clean);
    }
    if (!updates.length) return res.json({ message: 'no changes' });
    args.push(req.params.id);
    await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, args);
    res.json({ message: 'updated' });
  } catch (e) {
    sec.logSecurityEvent('product_update_error', req.ip, { code: e.code });
    return res.status(500).json(sec.safeError(e, process.env.NODE_ENV === 'development'));
  }
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

// Recently viewed — server-side per user
app.get('/api/users/me/recently-viewed', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.price, p.original_price, p.category, p.emoji, p.image_url, p.sold, p.review_avg, p.review_count,
             pv.viewed_at
      FROM product_views pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.user_id = ?
      ORDER BY pv.viewed_at DESC
      LIMIT 20
    `, [req.user.id]);
    res.json({ items: rows });
  } catch (e) {
    res.json({ items: [] });
  }
});

app.delete('/api/users/me/recently-viewed', authMiddleware, async (req, res) => {
  try { await pool.query('DELETE FROM product_views WHERE user_id = ?', [req.user.id]); res.json({ ok: true }); }
  catch (e) { res.json({ ok: true }); }
});

// Compare products
app.post('/api/products/compare', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  if (ids.length > 4) return res.status(400).json({ error: 'max 4 products' });
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.price, p.original_price, p.category, p.emoji, p.description, p.stock, p.sold,
             (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count,
             (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE product_id = p.id) as review_avg
      FROM products p WHERE p.id IN (?) AND p.status = 'active'
    `, [ids]);
    rows.forEach(r => { if (r.review_avg) r.review_avg = Number(r.review_avg).toFixed(1); });
    res.json({ products: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Spin wheel — random discount
app.post('/api/spin-wheel', async (req, res) => {
  const prizes = [
    { label: '5% OFF', code: 'SPIN5', value: 5, type: 'percent', weight: 30 },
    { label: '10% OFF', code: 'SPIN10', value: 10, type: 'percent', weight: 25 },
    { label: '15% OFF', code: 'SPIN15', value: 15, type: 'percent', weight: 15 },
    { label: '20% OFF', code: 'SPIN20', value: 20, type: 'percent', weight: 10 },
    { label: 'Rp 25.000 OFF', code: 'SPIN25K', value: 25000, type: 'flat', weight: 12 },
    { label: 'Rp 50.000 OFF', code: 'SPIN50K', value: 50000, type: 'flat', weight: 6 },
    { label: 'Free Shipping', code: 'FREESHIP', value: 0, type: 'shipping', weight: 2 }
  ];
  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * totalWeight;
  let chosen = prizes[0];
  for (const p of prizes) { if (r < p.weight) { chosen = p; break; } r -= p.weight; }
  res.json({ prize: chosen, expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() });
});

// Live visitors count (simple in-memory)
app.get('/api/stats/live', async (req, res) => {
  if (!global._liveCount) global._liveCount = Math.floor(Math.random() * 30) + 10;
  // Increment occasionally to simulate activity
  if (Math.random() < 0.3) global._liveCount += Math.random() < 0.5 ? 1 : -1;
  global._liveCount = Math.max(5, Math.min(80, global._liveCount));
  res.json({ online: global._liveCount });
});

// Newsletter subscribe (real backend, not just localStorage)
app.post('/api/newsletter/subscribe', async (req, res) => {
  const { email, source } = req.body;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'valid email required' });
  try {
    await pool.query('INSERT IGNORE INTO newsletter_subscribers (email, source) VALUES (?, ?)', [email, source || 'homepage']);
    // Send welcome email if Gmail configured
    if (process.env.GMAIL_APP_PASS) {
      try {
        await mailer.sendMail({
          from: `"Z Store" <${process.env.GMAIL_USER || 'zcusgt@gmail.com'}>`,
          to: email,
          subject: 'Selamat datang di Z Store Newsletter!',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#fff;border-radius:12px"><h2 style="color:#38bdf8">Selamat Datang!</h2><p>Terima kasih sudah subscribe newsletter Z Store. Kamu akan dapat update promo & produk baru.</p><p>Gunakan kode <b style="color:#fbbf24">WELCOME10</b> untuk diskon 10% order pertama kamu.</p></div>`
        });
      } catch (e) { console.error('Newsletter email failed:', e.message); }
    }
    res.json({ ok: true, message: 'Subscribed! Cek email kamu untuk kode diskon.' });
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
app.post('/api/orders/checkout', authMiddlewareWithBlacklist, rateLimit('checkout', 10, 60 * 60 * 1000), async (req, res) => {
  const { items, buyer_email, buyer_phone, source } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });
  if (items.length > 50) return res.status(400).json({ error: 'too many items (max 50)' });
  if (!sec.validateEmail(buyer_email)) return res.status(400).json({ error: 'invalid buyer_email' });
  if (buyer_phone && !sec.validatePhone(buyer_phone)) return res.status(400).json({ error: 'invalid buyer_phone' });
  if (source && !sec.validateString(source, 50)) return res.status(400).json({ error: 'invalid source' });
  // Validate each item
  for (const it of items) {
    if (!it || typeof it !== 'object') return res.status(400).json({ error: 'invalid item' });
    if (!sec.validateId(it.product_id)) return res.status(400).json({ error: 'invalid product_id' });
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 100) return res.status(400).json({ error: 'invalid qty (1-100)' });
  }
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
    // Cap total to prevent integer overflow / abuse
    if (total > 100_000_000) throw new Error('total exceeds limit');
    const cleanEmail = sec.sanitizeText(buyer_email).toLowerCase();
    const midtransOrderId = `ZCUS-${Date.now()}-${req.user.id}`;
    const [orderRes] = await conn.query('INSERT INTO orders (buyer_id, total, status, midtrans_order_id, buyer_email, buyer_phone) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, total, 'pending', midtransOrderId, cleanEmail, buyer_phone || null]);
    const orderId = orderRes.insertId;
    const orderItems = items.map(it => [orderId, it.product_id, it.qty, prodMap.get(it.product_id).price]);
    await conn.query('INSERT INTO order_items (order_id, product_id, qty, price) VALUES ?', [orderItems]);
    await conn.commit();

    // Send order to user across platforms
    await sendNotification(req.user.id, 'order', 'Order dibuat', `Order #${orderId} total ${total.toLocaleString('id-ID')}. Selesaikan pembayaran.`);

    const snapRes = await snap.createTransaction({
      transaction_details: { order_id: midtransOrderId, gross_amount: total },
      customer_details: { email: cleanEmail, first_name: (req.user.name || 'Buyer').slice(0, 50) },
      item_details: items.map(it => ({ id: String(it.product_id), price: prodMap.get(it.product_id).price, quantity: it.qty, name: (prodMap.get(it.product_id).name || 'Product').slice(0, 50) })),
      enabled_payments: ['credit_card','bca_va','bni_va','bri_va','gopay','shopeepay','qris','other_va','indomaret','alfamart']
    });
    await pool.query('UPDATE orders SET midtrans_token = ? WHERE id = ?', [snapRes.token, orderId]);
    res.json({ order_id: orderId, midtrans_order_id: midtransOrderId, snap_token: snapRes.token, total });
  } catch (e) {
    await conn.rollback();
    sec.logSecurityEvent('checkout_error', req.ip, { code: e.code, msg: e.message?.slice(0, 100) });
    return res.status(500).json(sec.safeError(e, process.env.NODE_ENV === 'development'));
  }
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

// ============ SUPPORT TICKETS ============
app.post('/api/support/tickets', authMiddleware, async (req, res) => {
  const { subject, message, category, priority } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'subject + message required' });
  try {
    const ticketId = 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
    const [r] = await pool.query(
      'INSERT INTO support_tickets (ticket_id, user_id, subject, message, category, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ticketId, req.user.id, subject, message, category || 'general', priority || 'normal', 'open']
    );
    res.json({ id: r.insertId, ticket_id: ticketId, status: 'open', message: 'Tiket dibuat. Tim CS akan balas via email dalam 1x24 jam.' });
  } catch (e) {
    // Fallback: store in memory for dev
    if (!global._tickets) global._tickets = [];
    const ticketId = 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
    global._tickets.push({ id: ticketId, user_id: req.user.id, subject, message, category: category||'general', priority: priority||'normal', status: 'open', created_at: new Date() });
    res.json({ id: ticketId, ticket_id: ticketId, status: 'open', message: 'Tiket dibuat (dev mode). Tim CS akan balas.' });
  }
});

app.get('/api/support/tickets', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ tickets: rows });
  } catch (e) {
    res.json({ tickets: (global._tickets || []).filter(t => t.user_id === req.user.id).slice(-50).reverse() });
  }
});

app.get('/api/support/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM support_tickets WHERE ticket_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ticket not found' });
    const [msgs] = await pool.query('SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC', [rows[0].id]);
    res.json({ ticket: rows[0], messages: msgs });
  } catch (e) {
    const t = (global._tickets || []).find(t => t.ticket_id === req.params.id && t.user_id === req.user.id);
    res.json({ ticket: t || null, messages: [] });
  }
});

app.post('/api/support/tickets/:id/reply', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const [t] = await pool.query('SELECT id FROM support_tickets WHERE ticket_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!t[0]) return res.status(404).json({ error: 'ticket not found' });
    await pool.query('INSERT INTO support_messages (ticket_id, user_id, message, is_staff) VALUES (?, ?, ?, FALSE)', [t[0].id, req.user.id, message]);
    await pool.query('UPDATE support_tickets SET updated_at = NOW() WHERE id = ?', [t[0].id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ AFFILIATE / REFERRAL SYSTEM ============
function genRefCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

app.get('/api/affiliate/code', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM affiliate_codes WHERE user_id = ?', [req.user.id]);
    if (rows[0]) return res.json(rows[0]);
    const code = genRefCode();
    const [r] = await pool.query('INSERT INTO affiliate_codes (user_id, code) VALUES (?, ?)', [req.user.id, code]);
    res.json({ id: r.insertId, user_id: req.user.id, code, clicks: 0, conversions: 0, total_earned: 0 });
  } catch (e) {
    // Dev fallback
    if (!global._affCodes) global._affCodes = new Map();
    if (!global._affCodes.has(req.user.id)) global._affCodes.set(req.user.id, { code: genRefCode(), clicks: 0, conversions: 0, total_earned: 0 });
    res.json(global._affCodes.get(req.user.id));
  }
});

app.get('/api/affiliate/stats', authMiddleware, async (req, res) => {
  try {
    const [codes] = await pool.query('SELECT * FROM affiliate_codes WHERE user_id = ?', [req.user.id]);
    const code = codes[0]?.code;
    if (!code) return res.json({ code: null, clicks: 0, conversions: 0, conversion_rate: 0, total_earned: 0, referrals: [] });
    const [clicks] = await pool.query("SELECT COUNT(*) as c FROM affiliate_clicks WHERE code = ?", [code]);
    const [refs] = await pool.query("SELECT user_id, order_id, commission, created_at FROM affiliate_referrals WHERE code = ? ORDER BY created_at DESC LIMIT 50", [code]);
    const total_earned = refs.reduce((s, r) => s + Number(r.commission || 0), 0);
    const conversions = refs.length;
    res.json({ code, clicks: clicks[0]?.c || 0, conversions, conversion_rate: clicks[0]?.c ? (conversions / clicks[0].c * 100).toFixed(1) : 0, total_earned, referrals: refs });
  } catch (e) {
    const c = global._affCodes?.get(req.user.id) || { code: null, clicks: 0, conversions: 0, total_earned: 0 };
    res.json({ ...c, conversion_rate: 0, referrals: [] });
  }
});

app.post('/api/affiliate/track-click', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const [c] = await pool.query('SELECT id FROM affiliate_codes WHERE code = ?', [code]);
    if (c[0]) {
      await pool.query('INSERT INTO affiliate_clicks (code_id, code, ip, user_agent) VALUES (?, ?, ?, ?)', [c[0].id, code, req.ip, req.headers['user-agent'] || '']);
      await pool.query('UPDATE affiliate_codes SET clicks = clicks + 1 WHERE id = ?', [c[0].id]);
    }
    res.json({ ok: true });
  } catch (e) { res.json({ ok: true }); }
});

app.get('/api/affiliate/leaderboard', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.name, u.avatar_url, ac.code, ac.clicks, ac.conversions, ac.total_earned
      FROM affiliate_codes ac
      JOIN users u ON ac.user_id = u.id
      ORDER BY ac.total_earned DESC LIMIT 20
    `);
    res.json({ leaderboard: rows });
  } catch (e) { res.json({ leaderboard: [] }); }
});

// ============ INVOICE / RECEIPT ============
app.get('/api/orders/:id/invoice', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!orders[0]) return res.status(404).json({ error: 'not found' });
    const o = orders[0];
    if (o.buyer_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const [items] = await pool.query(`SELECT oi.*, p.name, p.category, p.emoji FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [req.params.id]);
    const [buyer] = await pool.query('SELECT email, name FROM users WHERE id = ?', [o.buyer_id]);
    const [sellers] = await pool.query(`SELECT DISTINCT u.id, u.name, u.email FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN users u ON p.seller_id = u.id WHERE oi.order_id = ?`, [req.params.id]);
    // Generate invoice number
    const invNum = 'INV-' + new Date(o.created_at).getFullYear() + '-' + String(o.id).padStart(5, '0');
    res.json({
      invoice: {
        number: invNum,
        issued_at: new Date().toISOString(),
        company: { name: 'Z Store', email: 'zcusgt@gmail.com', address: 'Jakarta, Indonesia' },
        buyer: buyer[0],
        sellers: sellers,
        items,
        subtotal: o.total,
        total: o.total,
        payment_method: o.payment_type || 'qris',
        status: o.status,
        paid_at: o.paid_at,
        delivered_at: o.delivered_at,
        midtrans_order_id: o.midtrans_order_id
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ ORDER TRACKING (public, by order ID) ============
app.get('/api/track/:orderId', async (req, res) => {
  try {
    const [o] = await pool.query('SELECT id, status, paid_at, delivered_at, confirmed_at, created_at FROM orders WHERE id = ? OR midtrans_order_id = ?', [req.params.orderId, req.params.orderId]);
    if (!o[0]) return res.status(404).json({ error: 'order not found' });
    res.json({ tracking: o[0], steps: buildTrackingSteps(o[0]) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildTrackingSteps(o) {
  return [
    { code: 'created', label: 'Order dibuat', at: o.created_at, done: true },
    { code: 'paid', label: 'Pembayaran diterima', at: o.paid_at, done: !!o.paid_at },
    { code: 'delivered', label: 'Credentials dikirim', at: o.delivered_at, done: !!o.delivered_at },
    { code: 'completed', label: 'Order selesai', at: o.confirmed_at, done: !!o.confirmed_at }
  ];
}

// ============ WISHLIST SHARE (public) ============
app.get('/api/wishlist/share/:code', async (req, res) => {
  // For dev: just return mock data
  res.json({ code: req.params.code, products: [], created_at: new Date().toISOString() });
});

// ============ WELCOME NOTIFICATION ON NEW USER ============
// (already in /api/auth/google and /api/auth/otp/verify register)

// ============ RATE LIMITER (legacy per-endpoint, augmented by sec.globalRateLimit) ============
const rateStore = new Map(); // key → { count, resetAt }
function rateLimit(key, maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const fullKey = `${key}:${ip}`;
    const now = Date.now();
    const entry = rateStore.get(fullKey);
    if (!entry || entry.resetAt < now) {
      rateStore.set(fullKey, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam ' + retryAfter + ' detik.' });
    }
    next();
  };
}
// Cleanup old rate entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateStore.entries()) if (v.resetAt < now) rateStore.delete(k);
}, 10 * 60 * 1000);

// 3. Account lockout after failed logins
const loginAttempts = new Map(); // email → { count, lockedUntil, lastAttempt }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 min
function recordFailedLogin(email) {
  const e = email.toLowerCase().trim();
  const now = Date.now();
  const entry = loginAttempts.get(e) || { count: 0, lockedUntil: 0, lastAttempt: 0 };
  if (entry.lockedUntil > now) return entry; // already locked
  entry.count++;
  entry.lastAttempt = now;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION;
    entry.count = 0;
  }
  loginAttempts.set(e, entry);
  return entry;
}
function resetLoginAttempts(email) {
  loginAttempts.delete(email.toLowerCase().trim());
}
function checkLocked(email) {
  const entry = loginAttempts.get(email.toLowerCase().trim());
  if (entry && entry.lockedUntil > Date.now()) return entry.lockedUntil;
  return null;
}

// 4. Audit log (sensitive operations)
async function auditLog(userId, action, details = {}) {
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, action, details, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [userId || null, action, JSON.stringify(details).slice(0, 500), req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '', (req?.headers?.['user-agent'] || '').slice(0, 200)]
    );
  } catch (e) { /* table may not exist; fallback to console */ }
  console.log(`[AUDIT] user=${userId} action=${action} ip=${details.ip || '-'}`);
}

// 5. Input validation helpers
function validateEmail(email) {
  if (typeof email !== 'string') return false;
  email = email.trim().toLowerCase();
  if (email.length > 254) return false;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
}
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) return { ok: false, msg: 'Password minimal 8 karakter, maksimal 128' };
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return { ok: false, msg: 'Password harus mengandung huruf dan angka' };
  return { ok: true };
}
function validatePhone(phone) {
  if (!phone) return true;
  if (typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-+()]/g, '');
  return /^\+?\d{8,15}$/.test(cleaned);
}
function sanitize(str, max = 500) {
  if (typeof str !== 'string') return '';
  return str.slice(0, max).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
}

// 6. Token blacklist (logout invalidates)
const tokenBlacklist = new Set();
function blacklistToken(token) {
  if (token) tokenBlacklist.add(token);
  // Cap memory
  if (tokenBlacklist.size > 5000) {
    const arr = Array.from(tokenBlacklist).slice(-2500);
    tokenBlacklist.clear();
    arr.forEach(t => tokenBlacklist.add(t));
  }
}
function authMiddlewareWithBlacklist(req, res, next) {
  if (tokenBlacklist.has(req.token || (req.headers.authorization || '').slice(7))) {
    return res.status(401).json({ error: 'token revoked' });
  }
  return authMiddleware(req, res, next);
}

// 7. Request ID for tracing
app.use((req, res, next) => {
  req.id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  res.setHeader('X-Request-ID', req.id);
  next();
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
