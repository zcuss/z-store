// Fastify server — z-store v2 with multi-driver DB, multi-OAuth, RBAC
// Env loaded via Node's native --env-file=.env flag in npm scripts.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { db } from './db/index.js';
import { migrate } from './db/migrations.js';
import { authRoutes } from './routes/auth.js';
import { authExtrasRoutes } from './routes/auth-extras.js';
import { productRoutes } from './routes/products.js';
import { orderRoutes } from './routes/orders.js';
import { adminRoutes } from './routes/admin.js';
import { integrationRoutes } from './routes/integrations.js';
import { userRoutes } from './routes/users.js';
import { webhookRoutes } from './routes/webhooks.js';
import { publicRoutes } from './routes/public.js';
import { sellerRoutes } from './routes/seller.js';
import { affiliateRoutes } from './routes/affiliate.js';
import { supportRoutes } from './routes/support.js';
import { notificationRoutes } from './routes/notifications.js';
import { trackRoutes } from './routes/track.js';

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET env not set'); process.exit(1); }

// ============ Fastify setup ============
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
  bodyLimit: 512 * 1024, // 512kb
  ajv: { customOptions: { coerceTypes: true, useDefaults: true, removeAdditional: 'all' } },
});

// ============ Plugins ============
await app.register(helmet, {
  contentSecurityPolicy: false, // frontend handles its own CSP via meta
  crossOriginEmbedderPolicy: false,
});
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = [
      /^https?:\/\/(.+\.)?zcus\.biz\.id$/,
      /^https?:\/\/(.+\.)?zcus\.my\.id$/,
      /^https?:\/\/(.+\.)?trycloudflare\.com$/,
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    ];
    if (allowed.some((re) => re.test(origin))) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
});
await app.register(cookie);
await app.register(formbody);
await app.register(jwt, {
  secret: JWT_SECRET,
  sign: { expiresIn: '30d' },
  verify: { extractToken: (req) => {
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) return h.slice(7);
    return req.cookies?.token;
  }},
});
await app.register(rateLimit, {
  global: false, // per-route configuration
});

// ============ Mailer ============
export const mailer = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  auth: process.env.GMAIL_USER ? {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  } : undefined,
});

// ============ Decorators ============
app.decorate('db', db());
app.decorate('mailer', mailer);
app.decorate('authenticate', async (req, reply) => {
  let decoded;
  try {
    decoded = await req.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
  // Token blacklist: check if this jti has been revoked
  if (decoded.jti) {
    const revoked = await app.db('user_sessions').where({ jti: decoded.jti }).whereNotNull('revoked_at').first();
    if (revoked) {
      reply.code(401).send({ error: 'token_revoked' });
      return reply;
    }
  }
  // Re-fetch user from DB to get current email_verified/role/2fa status
  // (JWT may be stale; DB is source of truth for security decisions)
  try {
    const u = await app.db('users').where({ id: decoded.id }).first();
    if (!u) {
      reply.code(401).send({ error: 'user_not_found' });
      return reply;
    }
    req.user = {
      id: u.id, email: u.email, name: u.name, role: u.role,
      email_verified: !!u.email_verified, totp_enabled: !!u.totp_enabled,
      admin_subrole: u.admin_subrole || null,
    };
  } catch (e) {
    req.log.error('auth db lookup failed:', e);
    reply.code(500).send({ error: 'auth_lookup_failed' });
    return reply;
  }
});
app.decorate('requireRole', (...roles) => async (req, reply) => {
  if (!req.user) { reply.code(401).send({ error: 'unauthorized' }); return reply; }
  if (!roles.includes(req.user.role)) { reply.code(403).send({ error: 'forbidden' }); return reply; }
});
app.decorate('requireEmailVerified', async (req, reply) => {
  if (!req.user) { reply.code(401).send({ error: 'unauthorized' }); return reply; }
  if (!req.user.email_verified && req.user.role !== 'dev') {
    reply.code(403).send({ error: 'email_verified required', verify_url: '/shop/settings' });
    return reply;
  }
});

// ============ Rate limiter helper ============
const rate = (key, max, windowMs) => async (req, reply) => {
  // simple in-memory bucket per (ip+key)
  const bucket = req.ip + ':' + key;
  const now = Date.now();
  app.buckets ||= new Map();
  const b = app.buckets.get(bucket) || { count: 0, firstAt: now };
  if (now - b.firstAt > windowMs) { b.count = 0; b.firstAt = now; }
  b.count++;
  app.buckets.set(bucket, b);
  if (b.count > max) {
    reply.header('Retry-After', Math.ceil((windowMs - (now - b.firstAt)) / 1000));
    return reply.code(429).send({ error: 'rate_limited' });
  }
};

// ============ Helpers ============
const issueToken = (user) => {
  const jti = crypto.randomUUID();
  const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name, jti });
  return { token, jti };
};
const setAuthCookie = (reply, token) => {
  reply.setCookie('token', token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 30 * 24 * 60 * 60,
  });
};

// ============ Static frontend serving (mount at /shop/*) ============
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend/shop');
if (fs.existsSync(FRONTEND_DIR)) {
  // Serve static at /shop/* (HTML/CSS/JS/images).
  // Root path / redirects to /shop/.
  app.get('/', async (_req, reply) => reply.redirect('/shop/'));
  app.get('/shop', async (_req, reply) => reply.redirect('/shop/'));
  app.register(async (instance) => {
    instance.get('/shop/*', async (req, reply) => {
      let urlPath = req.url.split('?')[0];
      let rel = urlPath.replace(/^\/shop/, '') || '/';
      rel = rel.replace(/\/+$/, '') || '/';
      const fpath = path.join(FRONTEND_DIR, rel);
      if (!fpath.startsWith(FRONTEND_DIR)) return reply.code(403).send('Forbidden');
      try {
        const stat = fs.statSync(fpath);
        if (stat.isFile()) {
          const ext = path.extname(fpath).toLowerCase();
          const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'}[ext] || 'application/octet-stream';
          reply.header('Cache-Control', /\.(css|js|woff2?|svg|png|jpg|jpeg|gif|webp|ico)$/i.test(rel) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
          return reply.type(mime).send(fs.createReadStream(fpath));
        }
      } catch (e) { /* fallthrough */ }
      // SPA fallback: try .html, then /index.html
      if (!path.extname(rel)) {
        const htmlPath = path.join(FRONTEND_DIR, rel + '.html');
        if (fs.existsSync(htmlPath)) {
          return reply.type('text/html').send(fs.createReadStream(htmlPath));
        }
        const dirIndex = path.join(FRONTEND_DIR, rel, 'index.html');
        if (fs.existsSync(dirIndex)) {
          return reply.type('text/html').send(fs.createReadStream(dirIndex));
        }
        return reply.type('text/html').send(fs.createReadStream(path.join(FRONTEND_DIR, 'index.html')));
      }
      return reply.code(404).send('Not Found');
    });
  });
  console.log('[static] serving frontend at /shop/* from', FRONTEND_DIR);
}

// ============ Health + Meta ============
app.get('/api/health', async (req, reply) => {
  app.log.info('[health] called');
  try {
    const dbi = app.db;
    const r = await dbi.raw('SELECT 1 as ok');
    return { status: 'ok', db: true, driver: app.db.driver, node: process.version, time: new Date().toISOString() };
  } catch (e) {
    app.log.error({ err: e }, '[health] err');
    return reply.code(500).send({ status: 'degraded', db: false, error: e.message });
  }
});

app.get('/api', async () => ({
  name: 'Z Store API v2 (Fastify)',
  version: '2.0.0',
  stack: { framework: 'fastify', db: db().driver },
  endpoints: {
    auth: ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/otp/request', 'POST /api/auth/otp/verify',
            'POST /api/auth/magic-link/request', 'POST /api/auth/magic-link/verify',
            'POST /api/auth/google', 'POST /api/auth/telegram', 'POST /api/auth/discord', 'POST /api/auth/whatsapp',
            'GET /api/auth/me', 'GET /api/auth/platforms',
            'POST /api/auth/link', 'POST /api/auth/unlink', 'POST /api/auth/logout', 'POST /api/auth/logout-all'],
    users: ['GET /api/users/me', 'PUT /api/users/me', 'GET /api/users/me/platforms'],
    products: ['GET /api/products', 'GET /api/products/:id', 'GET /api/products/slug/:slug',
               'POST /api/products (seller)', 'PUT /api/products/:id (seller)', 'DELETE /api/products/:id (seller)',
               'POST /api/products/:id/inventory (seller)', 'GET /api/products/:id/reviews', 'POST /api/products/:id/reviews'],
    orders: ['GET /api/orders/me', 'GET /api/orders/:id', 'POST /api/orders/checkout',
             'POST /api/orders/:id/confirm-delivery', 'GET /api/orders/:id/invoice'],
    admin: ['GET /api/admin/users', 'GET /api/admin/stats', 'GET /api/admin/orders', 'GET /api/admin/withdrawals',
            'PUT /api/admin/users/:id/role', 'POST /api/admin/withdrawals/:id/approve', 'POST /api/admin/withdrawals/:id/reject',
            'POST /api/admin/dev/view-as'],
    integrations: ['POST /api/integrations/telegram/bot', 'POST /api/integrations/discord/bot',
                   'POST /api/integrations/whatsapp/connect', 'GET /api/integrations/me'],
    webhooks: ['POST /api/webhooks/midtrans', 'POST /api/webhooks/telegram', 'POST /api/webhooks/discord', 'POST /api/webhooks/whatsapp'],
    public: ['GET /api/health', 'GET /api/categories', 'GET /api/promos', 'GET /api/stats/live'],
  },
}));

// ============ Mount routes ============
await app.register(authRoutes, { prefix: '/api/auth', rate });
await app.register(authExtrasRoutes, { prefix: '/api/auth' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(productRoutes, { prefix: '/api/products' });
await app.register(orderRoutes, { prefix: '/api/orders' });
await app.register(adminRoutes, { prefix: '/api/admin' });
await app.register(integrationRoutes, { prefix: '/api/integrations' });
await app.register(webhookRoutes, { prefix: '/api/webhooks' });
await app.register(publicRoutes, { prefix: '/api' });
await app.register(sellerRoutes, { prefix: '/api/seller' });
await app.register(affiliateRoutes, { prefix: '/api/affiliate' });
await app.register(supportRoutes, { prefix: '/api/support' });
await app.register(notificationRoutes, { prefix: '/api/notifications' });
await app.register(trackRoutes, { prefix: '/api/track' });

// ============ Error handler ============
app.setErrorHandler((err, req, reply) => {
  req.log.error({ err, url: req.url, method: req.method }, 'request error');
  const status = err.statusCode || 500;
  reply.code(status).send({ error: err.message || 'internal_error', code: err.code });
});

// ============ Boot ============
async function bootstrap() {
  // Run migrations if not yet
  const auto = process.env.AUTO_MIGRATE !== 'false';
  if (auto) {
    try { await migrate(); }
    catch (e) { console.error('Migration error (continuing):', e.message); }
  }
  await app.listen({ port: PORT, host: HOST });
  console.log(`✓ Fastify listening on http://${HOST}:${PORT} (DB: ${db().driver})`);
}

bootstrap().catch((e) => { console.error('Boot failed:', e); process.exit(1); });

export { app, setAuthCookie, issueToken, rate };
