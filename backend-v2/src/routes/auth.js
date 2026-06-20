// Auth routes: register, login, OTP, magic link, OAuth (Google/Telegram/Discord/WhatsApp), logout
import bcrypt from 'bcryptjs';
import axios from 'axios';

const genOtp = () => String(crypto.randomInt(100000, 1000000));
const genToken = () => crypto.randomBytes(32).toString('hex');

export async function authRoutes(app, { rate }) {

  // ============ REGISTER (email + password) ============
  app.post('/register', {
    preHandler: rate('register', 5, 60 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string', maxLength: 100 },
          role: { type: 'string', enum: ['buyer', 'seller'] },
          locale: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password, name, role = 'buyer', locale = 'id' } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const exists = await app.db('users').where({ email: cleanEmail }).first();
    if (exists) return reply.code(409).send({ error: 'email_already_registered' });

    const hash = await bcrypt.hash(password, 12);
    const userName = name || cleanEmail.split('@')[0];

    const [id] = await app.db('users').insert({
      email: cleanEmail,
      password_hash: hash,
      name: userName,
      role: role === 'seller' ? 'seller' : 'buyer',
      email_verified: false,
    });

    // Send OTP for email verification
    const otp = genOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await app.db('otp_codes').insert({
      target: cleanEmail,
      code: otp,
      purpose: 'verify',
      channel: 'email',
      expires_at: expiresAt,
      attempts: 0,
    });

    let otp_sent = false;
    try {
      await app.mailer.sendMail({
        from: `"Z Store" <${process.env.GMAIL_USER || 'noreply@zcussxyz'}>`,
        to: cleanEmail,
        subject: 'Verifikasi Email Z Store',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#fff;border-radius:12px"><h2 style="color:#38bdf8">Selamat Datang di Z Store!</h2><p>Halo <b>${userName}</b>,</p><p>Untuk mengaktifkan akun, masukkan kode:</p><div style="background:#1e293b;padding:16px;text-align:center;letter-spacing:6px;font-size:28px;font-weight:700;color:#38bdf8;border-radius:8px;margin:16px 0">${otp}</div><p style="color:#94a3b8;font-size:13px">Berlaku 10 menit.</p></div>`,
      });
      otp_sent = true;
    } catch (e) { app.log.error('register email failed:', e.message); }

    const user = { id, email: cleanEmail, name: userName, role, email_verified: false };
    const token = app.jwt.sign({  id: user.id, email: user.email, role: user.role, name: user.name , jti: crypto.randomUUID() });
    return reply.send({ user, token, requires_verification: true, otp_sent, message: 'Registrasi berhasil. Cek email untuk kode verifikasi.' });
  });

  // ============ LOGIN (email + password) ============
  app.post('/login', {
    preHandler: rate('login', 10, 15 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const user = await app.db('users').where({ email: cleanEmail }).first();
    if (!user || !user.password_hash) {
      // Constant-time: bcrypt dummy compare to prevent timing oracle
      await bcrypt.compare(password, '$2a$12$0000000000000000000000000000000000000000000000000000');
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });

    await app.db('users').where({ id: user.id }).update({ last_login_at: app.db.fn.now() });

    // 2FA challenge: if user has TOTP enabled, return a 2fa_required token + temp session
    if (user.totp_enabled) {
      const tempToken = app.jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name, twofa: true },
        { expiresIn: '5m' }
      );
      return reply.send({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, email_verified: !!user.email_verified, totp_enabled: true },
        token: tempToken,
        requires_2fa: true,
        message: 'Masukkan kode 2FA dari authenticator app Anda',
      });
    }

    const token = app.jwt.sign({  id: user.id, email: user.email, role: user.role, name: user.name , jti: crypto.randomUUID() });
    reply.setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    return reply.send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, email_verified: !!user.email_verified },
      token,
      requires_verification: !user.email_verified,
      message: user.email_verified ? 'ok' : 'Email belum diverifikasi. Cek inbox untuk kode OTP.',
    });
  });

  // 2FA verify (after login with totp_enabled)
  app.post('/2fa/verify', {
    preHandler: rate('2fa-verify', 5, 10 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        required: ['token', 'code'],
        properties: { token: { type: 'string' }, code: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { token, code } = req.body;
    let payload;
    try { payload = app.jwt.verify(token); }
    catch (e) { return reply.code(401).send({ error: 'invalid_or_expired_token' }); }
    if (!payload.twofa) return reply.code(400).send({ error: 'not_a_2fa_token' });
    const user = await app.db('users').where({ id: payload.id }).first();
    if (!user || !user.totp_secret) return reply.code(404).send({ error: 'user_not_found' });
    // Verify TOTP code
    const clean = String(code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) return reply.code(400).send({ error: 'invalid_code_format' });
    // Inline TOTP verify (HMAC-SHA1)
    const crypto = await import('node:crypto');
    const base32Decode = (str) => {
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
    };
    const totp = (secret, time) => {
      const key = base32Decode(secret);
      // IMPORTANT: use BigInt to avoid JS 32-bit shift masking bug
      // (>> 56 in JS is treated as >> 24 because shift amount mod 32)
      const timeBig = BigInt(time);
      const buf = Buffer.alloc(8);
      for (let i = 0; i < 8; i++) {
        buf[i] = Number((timeBig >> BigInt(56 - i * 8)) & 0xffn);
      }
      const hmac = crypto.createHmac('sha1', key).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 | (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
      return String(code).padStart(6, '0');
    };
    const now = Math.floor(Date.now() / 1000 / 30);
    let valid = false;
    for (let w = -1; w <= 1; w++) {
      if (totp(user.totp_secret, now + w) === clean) { valid = true; break; }
    }
    if (!valid) return reply.code(401).send({ error: 'invalid_2fa_code' });
    // Issue real token
    const realToken = app.jwt.sign({  id: user.id, email: user.email, role: user.role, name: user.name , jti: crypto.randomUUID() });
    reply.setCookie('token', realToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    return reply.send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, email_verified: !!user.email_verified },
      token: realToken,
      message: 'ok',
    });
  });

  // ============ OTP REQUEST ============
  app.post('/otp/request', {
    preHandler: rate('otp-req', 3, 10 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        required: ['target', 'purpose'],
        properties: {
          target: { type: 'string' },
          purpose: { type: 'string', enum: ['verify', 'login', 'reset', '2fa'] },
          channel: { type: 'string', enum: ['email', 'whatsapp', 'telegram'] },
        },
      },
    },
  }, async (req, reply) => {
    const { target, purpose, channel = 'email' } = req.body;
    // Rate limit per target (in addition to IP rate limit)
    const recent = await app.db('otp_codes').where({ target, purpose }).orderBy('created_at', 'desc').first();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 60 * 1000) {
      return reply.code(429).send({ error: 'wait_60_seconds' });
    }
    const otp = genOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await app.db('otp_codes').insert({ target, code: otp, purpose, channel, expires_at: expiresAt, attempts: 0 });

    if (channel === 'email') {
      try {
        await app.mailer.sendMail({
          from: `"Z Store" <${process.env.GMAIL_USER || 'noreply@zcussxyz'}>`,
          to: target,
          subject: `Kode OTP Z Store: ${otp}`,
          html: `<p>Kode OTP kamu: <b style="font-size:24px;letter-spacing:6px">${otp}</b></p><p>Berlaku 10 menit.</p>`,
        });
      } catch (e) { app.log.error('OTP email failed:', e.message); }
    } else if (channel === 'whatsapp' && app.whatsapp) {
      try { await app.whatsapp.sendMessage(target, `Kode OTP Z Store: ${otp}\n\nBerlaku 10 menit.`); }
      catch (e) { app.log.error('OTP WA failed:', e.message); }
    } else if (channel === 'telegram' && app.telegram) {
      // telegram bot sends message
    }
    return reply.send({ ok: true, channel, expires_in: 600 });
  });

  // ============ OTP VERIFY ============
  app.post('/otp/verify', {
    preHandler: rate('otp-verify', 10, 10 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        required: ['target', 'code', 'purpose'],
        properties: { target: { type: 'string' }, code: { type: 'string' }, purpose: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { target, code, purpose } = req.body;
    const rec = await app.db('otp_codes').where({ target, purpose }).orderBy('created_at', 'desc').first();
    if (!rec) return reply.code(400).send({ error: 'otp_not_found' });
    if (rec.used_at) return reply.code(400).send({ error: 'otp_already_used' });
    if (new Date(rec.expires_at) < new Date()) return reply.code(400).send({ error: 'otp_expired' });
    if (rec.code !== code) {
      await app.db('otp_codes').where({ id: rec.id }).increment('attempts', 1);
      return reply.code(400).send({ error: 'otp_invalid', attempts: rec.attempts + 1 });
    }
    await app.db('otp_codes').where({ id: rec.id }).update({ used_at: app.db.fn.now() });

    // Side effects per purpose
    if (purpose === 'verify') {
      const user = await app.db('users').where({ email: target }).first();
      if (!user) return reply.code(404).send({ error: 'user_not_found' });
      await app.db('users').where({ id: user.id }).update({ email_verified: true, email_verified_at: app.db.fn.now() });
    } else if (purpose === 'reset') {
      // handled by reset-password endpoint
    } else if (purpose === 'login') {
      const user = await app.db('users').where({ email: target }).first();
      if (!user) return reply.code(404).send({ error: 'user_not_found' });
      const token = app.jwt.sign({  id: user.id, email: user.email, role: user.role, name: user.name , jti: crypto.randomUUID() });
      reply.setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
      return reply.send({ ok: true, user: { id: user.id, email: user.email, role: user.role }, token, message: 'Login via OTP berhasil' });
    }
    return reply.send({ ok: true, verified: true });
  });

  // ============ MAGIC LINK REQUEST ============
  app.post('/magic-link/request', {
    preHandler: rate('magic', 3, 10 * 60 * 1000),
    schema: { body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } },
  }, async (req, reply) => {
    const { email } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const user = await app.db('users').where({ email: cleanEmail }).first();
    // Don't reveal if user exists
    if (user) {
      const token = genToken();
      await app.db('magic_links').insert({
        user_id: user.id, token, purpose: 'login',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });
      const link = `${process.env.BASE_URL || 'https://5.zcus.biz.id'}/shop/auth/magic.html?token=${token}`;
      try {
        await app.mailer.sendMail({
          from: `"Z Store" <${process.env.GMAIL_USER || 'noreply@zcussxyz'}>`,
          to: cleanEmail,
          subject: 'Link Login Z Store',
          html: `<p>Klik link ini untuk login (berlaku 15 menit):</p><p><a href="${link}" style="background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Login Sekarang</a></p><p>Link: <code>${link}</code></p>`,
        });
      } catch (e) { app.log.error('magic link email:', e.message); }
    }
    return reply.send({ ok: true, message: 'Jika email terdaftar, link login sudah dikirim.' });
  });

  // ============ MAGIC LINK VERIFY ============
  app.post('/magic-link/verify', {
    schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } },
  }, async (req, reply) => {
    const { token } = req.body;
    const link = await app.db('magic_links').where({ token }).first();
    if (!link) return reply.code(400).send({ error: 'invalid_link' });
    if (link.used_at) return reply.code(400).send({ error: 'link_already_used' });
    if (new Date(link.expires_at) < new Date()) return reply.code(400).send({ error: 'link_expired' });
    await app.db('magic_links').where({ id: link.id }).update({ used_at: app.db.fn.now() });
    const user = await app.db('users').where({ id: link.user_id }).first();
    const tokenJwt = app.jwt.sign({  id: user.id, email: user.email, role: user.role, name: user.name , jti: crypto.randomUUID() });
    reply.setCookie('token', tokenJwt, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    return reply.send({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: tokenJwt });
  });

  // ============ OAUTH: GOOGLE ============
  app.post('/google', {
    preHandler: rate('google', 15, 10 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        properties: {
          credential: { type: 'string' },
          google_id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          avatar_url: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { credential, google_id, email, name, avatar_url } = req.body;
    let payload;
    if (credential) {
      try {
        const verify = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        payload = verify.data;
      } catch (e) { return reply.code(401).send({ error: 'invalid_google_credential' }); }
      if (!payload.email || !payload.sub) return reply.code(400).send({ error: 'incomplete_google_payload' });
    } else if (google_id && email) {
      payload = { sub: google_id, email, name, picture: avatar_url };
    } else {
      return reply.code(400).send({ error: 'credential or google_id+email required' });
    }
    const user = await handleOAuthLink(app, reply, {
      platform: 'google',
      externalId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      avatar: payload.picture,
      emailVerified: true,
    });
    return reply.send({ user, token: user.token, isNew: user.isNew });
  });

  // ============ OAUTH: TELEGRAM (Login Widget) ============
  app.post('/telegram', {
    preHandler: rate('telegram', 15, 10 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          photo_url: { type: 'string' },
          auth_date: { type: 'string' },
          hash: { type: 'string' },
          email: { type: 'string' },
          email_verified: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    const { id, username, first_name, last_name, photo_url, email, email_verified } = req.body;
    const fullName = [first_name, last_name].filter(Boolean).join(' ') || username || `tg_${id}`;
    const user = await handleOAuthLink(app, reply, {
      platform: 'telegram',
      externalId: String(id),
      email: email && email_verified ? email.toLowerCase() : null,
      name: fullName,
      avatar: photo_url,
      emailVerified: !!email_verified,
      telegramUsername: username,
    });
    return reply.send({ user, token: user.token, isNew: user.isNew });
  });

  // ============ OAUTH: DISCORD ============
  app.post('/discord', {
    preHandler: rate('discord', 15, 10 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        properties: {
          access_token: { type: 'string' },
          id: { type: 'string' },
          username: { type: 'string' },
          email: { type: 'string', format: 'email' },
          avatar: { type: 'string' },
          global_name: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { access_token, id, username, email, avatar, global_name } = req.body;
    let profile;
    if (access_token) {
      try {
        const r = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
        profile = r.data;
      } catch (e) { return reply.code(401).send({ error: 'invalid_discord_token' }); }
    } else if (id) {
      profile = { id, username, email, avatar, global_name };
    } else {
      return reply.code(400).send({ error: 'access_token or id required' });
    }
    const avatarUrl = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith('a_') ? 'gif' : 'png'}` : null;
    const user = await handleOAuthLink(app, reply, {
      platform: 'discord',
      externalId: String(profile.id),
      email: profile.verified !== false && profile.email ? profile.email.toLowerCase() : null,
      name: profile.global_name || profile.username || `discord_${profile.id}`,
      avatar: avatarUrl,
      emailVerified: profile.verified !== false && !!profile.email,
    });
    return reply.send({ user, token: user.token, isNew: user.isNew });
  });

  // ============ OAUTH: WHATSAPP (Business API linking) ============
  app.post('/whatsapp', {
    preHandler: rate('whatsapp', 10, 10 * 60 * 1000),
    schema: {
      body: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', pattern: '^\\+\\d{7,15}$' },
          name: { type: 'string' },
          phone_number_id: { type: 'string' },
          whatsapp_business_id: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { phone, name } = req.body;
    const user = await handleOAuthLink(app, reply, {
      platform: 'whatsapp',
      externalId: phone,
      email: null,
      name: name || `WA ${phone.slice(-4)}`,
      avatar: null,
      emailVerified: false,
    });
    return reply.send({ user: user.user, token: user.token, isNew: user.isNew, message: user.isNew ? 'Akun WhatsApp dibuat. Tambahkan email di Settings.' : 'ok' });
  });

  // ============ ME ============
  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const user = await app.db('users').where({ id: req.user.id }).first();
    if (!user) return { error: 'not_found' };
    return {
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role, admin_subrole: user.admin_subrole,
        email_verified: !!user.email_verified, avatar_url: user.avatar_url, phone: user.phone, bio: user.bio,
        linked: {
          google: !!user.google_id, telegram: !!user.telegram_id, discord: !!user.discord_id, whatsapp: !!user.whatsapp_number,
          telegram_id: user.telegram_id, discord_id: user.discord_id, whatsapp_number: user.whatsapp_number,
        },
      },
    };
  });

  // ============ PLATFORMS (linked summary) ============
  app.get('/platforms', { preHandler: app.authenticate }, async (req) => {
    const user = await app.db('users').where({ id: req.user.id }).first();
    const integrations = await app.db('platform_integrations').where({ owner_id: req.user.id });
    return {
      platforms: {
        web: { linked: true, identifier: user.email, verified: !!user.email_verified, primary: true },
        google: { linked: !!user.google_id, identifier: user.google_id },
        telegram: { linked: !!user.telegram_id, identifier: user.telegram_id, username: user.telegram_username },
        discord: { linked: !!user.discord_id, identifier: user.discord_id },
        whatsapp: { linked: !!user.whatsapp_number, identifier: user.whatsapp_number },
        integrations: integrations.map(i => ({ platform: i.platform, status: i.status, enabled: !!i.enabled })),
      },
    };
  });

  // ============ LINK PLATFORM to existing account ============
  app.post('/link', { preHandler: app.authenticate, schema: { body: { type: 'object', required: ['platform','identifier'], properties: { platform: { type: 'string' }, identifier: { type: 'string' } } } } }, async (req, reply) => {
    const { platform, identifier } = req.body;
    const colMap = { telegram: 'telegram_id', discord: 'discord_id', whatsapp: 'whatsapp_number' };
    const col = colMap[platform];
    if (!col) return reply.code(400).send({ error: 'invalid_platform' });
    const conflict = await app.db('users').where({ [col]: identifier }).whereNot({ id: req.user.id }).first();
    if (conflict) return reply.code(409).send({ error: 'platform_already_linked_to_other_account' });
    await app.db('users').where({ id: req.user.id }).update({ [col]: identifier });
    return { ok: true, platform, identifier };
  });

  app.post('/unlink', { preHandler: app.authenticate, schema: { body: { type: 'object', required: ['platform'], properties: { platform: { type: 'string' } } } } }, async (req, reply) => {
    const colMap = { telegram: 'telegram_id', discord: 'discord_id', whatsapp: 'whatsapp_number' };
    const col = colMap[req.body.platform];
    if (!col) return reply.code(400).send({ error: 'invalid_platform' });
    await app.db('users').where({ id: req.user.id }).update({ [col]: null });
    return { ok: true, message: 'unlinked' };
  });

  // ============ LOGOUT ============
  app.post('/logout', async (req, reply) => {
    // Revoke token by jti
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) {
      const token = h.slice(7);
      try {
        const decoded = app.jwt.verify(token);
        if (decoded.jti && decoded.id) {
          await app.db('user_sessions')
            .insert({ jti: decoded.jti, user_id: decoded.id, revoked_at: app.db.fn.now() })
            .onConflict('jti').ignore();
        }
      } catch (e) { /* ignore invalid token */ }
    }
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  app.post('/logout-all', { preHandler: app.authenticate }, async (req, reply) => {
    // Revoke all tokens for this user
    await app.db('user_sessions')
      .where({ user_id: req.user.id, revoked_at: null })
      .update({ revoked_at: app.db.fn.now() });
    reply.clearCookie('token', { path: '/' });
    return { ok: true, message: 'Semua device logout. Silakan login ulang.' };
  });

  // ============ DEV: view-as-role (dev only) ============
  app.post('/dev/view-as', { preHandler: [app.authenticate, app.requireRole('dev')] }, async (req, reply) => {
    const { user_id } = req.body || {};
    if (!user_id) return reply.code(400).send({ error: 'user_id required' });
    const target = await app.db('users').where({ id: user_id }).first();
    if (!target) return reply.code(404).send({ error: 'not_found' });
    const token = app.jwt.sign({ id: target.id, email: target.email, role: target.role, name: target.name, jti: require('node:crypto').randomUUID(), view_as: true });
    return { token, user: { id: target.id, email: target.email, role: target.role, name: target.name } };
  });
}

// ============ Helper: OAuth linking ============
async function handleOAuthLink(app, reply, { platform, externalId, email, name, avatar, emailVerified, telegramUsername }) {
  const colMap = { google: 'google_id', telegram: 'telegram_id', discord: 'discord_id', whatsapp: 'whatsapp_number' };
  const col = colMap[platform];

  // Find existing user by platform_id OR email
  let user = await app.db('users').where({ [col]: externalId }).first();
  let isNew = false;
  if (!user && email) user = await app.db('users').where({ email: email.toLowerCase() }).first();

  if (user) {
    // Link missing platform + mark email verified if OAuth provides verified
    const updates = {};
    if (!user[col]) updates[col] = externalId;
    if (email && !user.email) updates.email = email.toLowerCase();
    if (emailVerified && !user.email_verified) { updates.email_verified = true; updates.email_verified_at = app.db.fn.now(); }
    if (avatar && !user.avatar_url) updates.avatar_url = avatar;
    if (platform === 'telegram' && telegramUsername && !user.telegram_username) updates.telegram_username = telegramUsername;
    if (Object.keys(updates).length > 0) await app.db('users').where({ id: user.id }).update(updates);
    user = await app.db('users').where({ id: user.id }).first();
  } else {
    // Create new
    const insertData = { name, role: 'buyer', email_verified: !!emailVerified };
    if (email) insertData.email = email.toLowerCase();
    if (col) insertData[col] = externalId;
    if (avatar) insertData.avatar_url = avatar;
    if (telegramUsername) insertData.telegram_username = telegramUsername;
    const [id] = await app.db('users').insert(insertData);
    user = await app.db('users').where({ id }).first();
    isNew = true;
    // Save default platform integration (silently ignore if table missing)
    try {
      await app.db('platform_integrations').insert({
        owner_id: id, platform, enabled: true, status: 'connected',
        config: JSON.stringify({ username: telegramUsername || externalId }),
      }).onConflict(['owner_id', 'platform']).ignore();
    } catch (e) { /* table may not have unique constraint, ignore */ }
  }

  const token = app.jwt.sign({  id: user.id, email: user.email, role: user.role, name: user.name , jti: crypto.randomUUID() });
  reply.setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role, email_verified: !!user.email_verified },
    token,
    isNew,
  };
}
