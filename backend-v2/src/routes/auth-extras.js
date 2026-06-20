// Auth extras: 2FA TOTP, change-password, profile, email-verify, link/request, link/confirm, security-status
import crypto from 'node:crypto';

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
function totp(secret, time = Math.floor(Date.now() / 1000 / 30)) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // IMPORTANT: use BigInt to avoid JS 32-bit shift masking bug
  // (>> 56 in JS is treated as >> 24 because shift amount mod 32)
  const timeBig = BigInt(time);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number((timeBig >> BigInt(56 - i * 8)) & 0xffn);
  }
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

// In-memory stores (use Redis in production)
const emailVerifyTokens = new Map();
const linkCodes = new Map();

export async function authExtrasRoutes(app) {
  // ============ CHANGE PASSWORD ============
  app.put('/password', { preHandler: app.authenticate }, async (req, reply) => {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) return reply.code(400).send({ error: 'current_password + new_password required' });
    if (new_password.length < 6) return reply.code(400).send({ error: 'Password baru minimal 6 karakter' });
    if (new_password === current_password) return reply.code(400).send({ error: 'Password baru harus beda dari yang lama' });
    const bcrypt = (await import('bcryptjs')).default;
    const u = await app.db('users').where({ id: req.user.id }).first();
    if (!u) return reply.code(404).send({ error: 'user not found' });
    if (!u.password_hash) return reply.code(400).send({ error: 'Akun ini login via Google/Telegram. Set password via link.' });
    const ok = await bcrypt.compare(current_password, u.password_hash);
    if (!ok) return reply.code(401).send({ error: 'Password lama salah' });
    const hash = await bcrypt.hash(new_password, 10);
    await app.db('users').where({ id: req.user.id }).update({ password_hash: hash });
    return { ok: true, message: 'Password berhasil diubah. Silakan login ulang dengan password baru.' };
  });

  // ============ UPDATE PROFILE ============
  app.put('/profile', { preHandler: app.authenticate }, async (req, reply) => {
    const { name, bio, avatar_url, phone } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = String(name).slice(0, 100);
    if (bio !== undefined) updates.bio = String(bio).slice(0, 500);
    if (avatar_url !== undefined) updates.avatar_url = String(avatar_url).slice(0, 500);
    if (phone !== undefined) updates.phone = String(phone).slice(0, 30);
    if (Object.keys(updates).length === 0) return { message: 'no changes' };
    await app.db('users').where({ id: req.user.id }).update(updates);
    const u = await app.db('users').where({ id: req.user.id }).first();
    return { user: { id: u.id, email: u.email, name: u.name, role: u.role, bio: u.bio, avatar_url: u.avatar_url, phone: u.phone } };
  });

  // ============ EMAIL VERIFY REQUEST ============
  app.post('/email/verify/request', { preHandler: app.authenticate }, async (req, reply) => {
    if (!req.user.email) return reply.code(400).send({ error: 'no_email_on_account' });
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 24 * 3600 * 1000;
    emailVerifyTokens.set(token, { userId: req.user.id, expiresAt });
    const link = `${process.env.BASE_URL || 'http://localhost:3002'}/shop/verify-email.html?token=${token}`;
    try {
      if (process.env.GMAIL_APP_PASS) {
        await app.mailer.sendMail({
          from: `"Z Store" <${process.env.GMAIL_USER || 'noreply@zcussxyz'}>`,
          to: req.user.email,
          subject: 'Verifikasi Email — Z Store',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2>Verifikasi Email</h2><p>Klik link untuk verifikasi:</p><a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Verifikasi Email</a><p style="color:#666;font-size:12px">Link kadaluarsa dalam 24 jam.</p></div>`,
        });
      }
      return { ok: true, message: 'Link verifikasi dikirim ke email', dev_link: process.env.GMAIL_APP_PASS ? undefined : link };
    } catch (e) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // ============ EMAIL VERIFY CONFIRM (via link) ============
  app.get('/email/verify', async (req, reply) => {
    const { token } = req.query;
    if (!token) return reply.code(400).send({ error: 'token required' });
    const entry = emailVerifyTokens.get(token);
    if (!entry) return reply.code(400).send({ error: 'Token tidak valid' });
    if (entry.expiresAt < Date.now()) {
      emailVerifyTokens.delete(token);
      return reply.code(400).send({ error: 'Token kadaluarsa' });
    }
    await app.db('users').where({ id: entry.userId }).update({ email_verified: true, email_verified_at: app.db.fn.now() });
    emailVerifyTokens.delete(token);
    return { ok: true, message: 'Email verified!' };
  });

  // ============ SECURITY STATUS (for settings page) ============
  app.get('/security-status', { preHandler: app.authenticate }, async (req) => {
    const u = await app.db('users').where({ id: req.user.id }).first();
    return {
      has_password: !!u.password_hash,
      has_google: !!u.google_id,
      totp_enabled: !!u.totp_enabled,
      email_verified: !!u.email_verified,
      security_score: (u.password_hash ? 25 : 0) + (u.totp_enabled ? 35 : 0) + (u.email_verified ? 25 : 0) + (u.google_id ? 15 : 0),
    };
  });

  // ============ 2FA TOTP SETUP ============
  app.post('/2fa/setup', { preHandler: app.authenticate }, async (req, reply) => {
    const secret = base32Encode(crypto.randomBytes(20));
    await app.db('users').where({ id: req.user.id }).update({ totp_secret: secret });
    const otpauth = `otpauth://totp/Z%20Store:${encodeURIComponent(req.user.email || 'user_' + req.user.id)}?secret=${secret}&issuer=Z%20Store`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
    return { secret, qr_url: qrUrl, otpauth };
  });

  // ============ 2FA TOTP ENABLE ============
  app.post('/2fa/enable', { preHandler: app.authenticate }, async (req, reply) => {
    const { code } = req.body || {};
    if (!code) return reply.code(400).send({ error: 'code required' });
    const u = await app.db('users').where({ id: req.user.id }).first();
    if (!u?.totp_secret) return reply.code(400).send({ error: 'Setup 2FA dulu' });
    if (!verifyTotp(u.totp_secret, code)) return reply.code(401).send({ error: 'Kode salah' });
    await app.db('users').where({ id: req.user.id }).update({ totp_enabled: true });
    return { ok: true, message: '2FA aktif' };
  });

  // ============ 2FA TOTP DISABLE ============
  app.post('/2fa/disable', { preHandler: app.authenticate }, async (req, reply) => {
    const { code, password } = req.body || {};
    const bcrypt = (await import('bcryptjs')).default;
    const u = await app.db('users').where({ id: req.user.id }).first();
    if (!u?.totp_secret) return { ok: true, message: '2FA belum aktif' };
    let ok = false;
    if (password && u.password_hash && await bcrypt.compare(password, u.password_hash)) ok = true;
    if (code && verifyTotp(u.totp_secret, code)) ok = true;
    if (!ok) return reply.code(401).send({ error: 'Password atau kode 2FA salah' });
    await app.db('users').where({ id: req.user.id }).update({ totp_enabled: false, totp_secret: null });
    return { ok: true };
  });

  // ============ LINK REQUEST (generate code for platform linking) ============
  app.post('/link/request', { preHandler: app.authenticate }, async (req, reply) => {
    const { platform } = req.body || {};
    if (!['telegram', 'whatsapp', 'discord'].includes(platform)) return reply.code(400).send({ error: 'invalid_platform' });
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    linkCodes.set(`${req.user.id}:${platform}`, { code, expiresAt: Date.now() + 600000 });
    let instruction = '';
    if (platform === 'telegram') instruction = `Buka @ZStoreBot, kirim /start, lalu masukkan kode: ${code}`;
    else if (platform === 'whatsapp') instruction = `Scan QR di Settings → Integrations, atau masukkan kode: ${code} setelah scan`;
    else if (platform === 'discord') instruction = `Invite bot ke server, jalankan /link code:${code}`;
    return { ok: true, code, instruction, expires_in: 600 };
  });

  // ============ LINK CONFIRM ============
  app.post('/link/confirm', { preHandler: app.authenticate }, async (req, reply) => {
    const { platform, code, identifier } = req.body || {};
    if (!['telegram', 'whatsapp', 'discord'].includes(platform)) return reply.code(400).send({ error: 'invalid_platform' });
    let finalIdentifier = identifier;
    if (!finalIdentifier && code) {
      const rec = linkCodes.get(`${req.user.id}:${platform}`);
      if (!rec || Date.now() > rec.expiresAt) return reply.code(400).send({ error: 'Code kadaluarsa' });
      if (rec.code !== code) return reply.code(400).send({ error: 'Code salah' });
      linkCodes.delete(`${req.user.id}:${platform}`);
      finalIdentifier = platform === 'telegram' ? `tg_${Date.now()}` : platform === 'whatsapp' ? `+628${Math.floor(Math.random() * 1e9)}` : `discord_${Date.now()}`;
    }
    if (!finalIdentifier) return reply.code(400).send({ error: 'identifier or valid code required' });
    const col = platform === 'telegram' ? 'telegram_id' : platform === 'whatsapp' ? 'whatsapp_number' : 'discord_id';
    await app.db('users').where({ id: req.user.id }).update({ [col]: finalIdentifier });
    return { ok: true, platform, identifier: finalIdentifier, message: `${platform} linked!` };
  });

  // ============ LOGOUT (token blacklist stub) ============
  // (defined in auth.js to avoid duplicate route)

  // ============ LOGOUT ALL ============
  // (defined in auth.js)

  // ============ RESET PASSWORD (via OTP, purpose=reset) ============
  app.post('/reset-password', async (req, reply) => {
    const { email, otp, new_password } = req.body || {};
    if (!email || !otp || !new_password) return reply.code(400).send({ error: 'email, otp, new_password required' });
    if (new_password.length < 6) return reply.code(400).send({ error: 'Password baru minimal 6 karakter' });
    const rec = await app.db('otp_codes').where({ target: email, purpose: 'reset' }).orderBy('created_at', 'desc').first();
    if (!rec || new Date(rec.expires_at) < new Date() || rec.code !== otp || rec.used_at) {
      return reply.code(400).send({ error: 'OTP tidak valid atau kadaluarsa' });
    }
    await app.db('otp_codes').where({ id: rec.id }).update({ used_at: app.db.fn.now() });
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(new_password, 10);
    await app.db('users').where({ email: email.toLowerCase() }).update({ password_hash: hash });
    return { ok: true, message: 'Password berhasil direset. Silakan login.' };
  });
}
