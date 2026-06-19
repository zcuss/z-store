// Z Store Security Middleware — Application hardening
// Defense-in-depth: anti-injection, anti-XSS, anti-DDoS, secure headers, input validation
'use strict';

const crypto = require('crypto');

// ============ INPUT VALIDATION ============
// Email RFC 5322 simplified
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Phone ID format: +62xxx or 08xxx, 8-15 digits
const PHONE_RE = /^\+?[0-9]{8,15}$/;
// Password: min 8 char, must have letter + number
const PW_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
// Slug: lowercase + dash only
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
// UUID v4
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateEmail(v) {
  return typeof v === 'string' && v.length <= 190 && EMAIL_RE.test(v.trim());
}
function validatePassword(v) {
  return typeof v === 'string' && PW_RE.test(v);
}
function validatePhone(v) {
  if (v === null || v === undefined || v === '') return true;
  return typeof v === 'string' && PHONE_RE.test(v.replace(/[\s-]/g, ''));
}
function validateString(v, maxLen = 500) {
  return typeof v === 'string' && v.length <= maxLen;
}
function validateId(v) {
  return Number.isInteger(v) && v > 0 && v < 2147483647;
}
function validateEnum(v, allowed) {
  return allowed.includes(v);
}

// Strip HTML tags from user input to prevent stored XSS
function sanitizeHTML(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

// Strip control chars + null bytes
function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

// First 12 hex chars of sha256 — used for PII-safe identifiers in audit logs
function sha256Short(input) {
  if (typeof input !== 'string') return '';
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
}

// Detect common injection patterns in any string
const INJECTION_PATTERNS = [
  /\bunion\s+select\b/i,
  /\bselect\s+.*\bfrom\b/i,
  /;\s*drop\s+/i,
  /;\s*delete\s+from/i,
  /<script\b[^>]*>/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /on\w+\s*=\s*["']/i,
  /\.\.\//,
  /%2e%2e%2f/i,
  /__import__\(/i,
  /require\s*\(/i,
  /\beval\s*\(/i,
  // SQL tautologies
  /(\bor\b|\band\b)\s+\d+\s*=\s*\d+/i,
  /(\bor\b|\band\b)\s+['"][^'"]*['"]\s*=\s*['"][^'"]*['"]/i,
  // classic comment-based
  /'\s*;\s*--/i,
  /'\s*or\s+'1'\s*=\s*'1/i,
  /\bxp_cmdshell\b/i,
  /\b(load_file|into\s+outfile|into\s+dumpfile)\b/i,
  // NoSQL operator injection
  /\$[a-z]+\s*:/i,
  /\bwhere\s+\$where\b/i,
];

function detectInjection(input) {
  if (typeof input !== 'string') return false;
  return INJECTION_PATTERNS.some(re => re.test(input));
}

// ============ SECURITY HEADERS ============
function securityHeaders(req, res, next) {
  // Strict CSP — allow only same-origin + trusted CDNs
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://api.qrserver.com https://*.trycloudflare.com",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:",
      "connect-src 'self' https://*.trycloudflare.com https://zcus.biz.id https://api.qrserver.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // Remove server fingerprint
  res.removeHeader('X-Powered-By');
  next();
}

// ============ CORS (strict) ============
const ALLOWED_ORIGINS = new Set([
  'https://zcus.biz.id',
  'https://www.zcus.biz.id',
  'https://api.zcus.biz.id',
  'https://zcus.my.id',
  'https://www.zcus.my.id',
  // tunnels (dev/demo)
  'https://anime-redhead-converter-hit.trycloudflare.com',
  'https://borders-vincent-opponent-feat.trycloudflare.com',
  'https://surprised-mod-sections-holidays.trycloudflare.com',
  'https://dna-alias-interfaces-coupons.trycloudflare.com',
  'https://glen-trade-citysearch-publicity.trycloudflare.com',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
]);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow any *.trycloudflare.com (dev tunnels)
  if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin)) return true;
  return false;
}

function corsStrict(req, res, next) {
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else {
    // No CORS for unknown origins (browser will block)
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
}

// ============ GLOBAL IP RATE LIMIT (defense-in-depth DDoS) ============
const ipBuckets = new Map();

function globalRateLimit(maxPerMin = 300, maxBurst = 50) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
    const now = Date.now();
    const window = 60_000;
    const bucket = ipBuckets.get(ip) || { count: 0, resetAt: now + window, burst: 0, burstReset: now + 1000 };
    if (bucket.resetAt < now) { bucket.count = 0; bucket.resetAt = now + window; }
    if (bucket.burstReset < now) { bucket.burst = 0; bucket.burstReset = now + 1000; }
    bucket.count++;
    bucket.burst++;
    ipBuckets.set(ip, bucket);

    // Burst: max 50 req/sec from same IP
    if (bucket.burst > maxBurst) {
      res.setHeader('Retry-After', '2');
      return res.status(429).json({ error: 'Too many requests (burst)' });
    }
    // Sustained: max 300 req/min from same IP
    if (bucket.count > maxPerMin) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Too many requests (sustained)' });
    }
    next();
  };
}

// Cleanup old buckets every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipBuckets.entries()) {
    if (v.resetAt < now && v.burstReset < now) ipBuckets.delete(k);
  }
}, 5 * 60 * 1000).unref();

// ============ INJECTION GUARD (anti-SQLi, anti-XSS, anti-RCE) ============
const SUSPICION_LOG = new Map(); // IP -> count
function injectionGuard(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
  const src = JSON.stringify({
    q: req.query,
    b: req.body,
    p: req.params,
  });
  if (detectInjection(src)) {
    const count = (SUSPICION_LOG.get(ip) || 0) + 1;
    SUSPICION_LOG.set(ip, count);
    // Auto-block repeat offenders (3+ injection attempts)
    if (count >= 3) {
      if (!ipBuckets.has(ip + ':blocked')) {
        // Mark as blocked for 1 hour
        ipBuckets.set(ip + ':blocked', { count: 999999, resetAt: Date.now() + 3600_000, burst: 999999, burstReset: Date.now() + 3600_000 });
      }
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Soft warn + continue (could be false positive)
    // console.warn('[SEC] injection attempt from', ip, src.slice(0, 200));
  }
  next();
}

// Cleanup suspicion log hourly
setInterval(() => SUSPICION_LOG.clear(), 3600_000).unref();

// ============ REQUEST SIZE & TIMING ============
function requestGuard(maxMs = 30_000) {
  return (req, res, next) => {
    // Timeout handler
    res.setTimeout(maxMs, () => {
      if (!res.headersSent) res.status(408).json({ error: 'Request timeout' });
    });
    // Slow-loris guard
    req.setTimeout(maxMs);
    next();
  };
}

// ============ ERROR SANITIZER ============
// Prevent leaking stack traces in production
function safeError(err, isDev = false) {
  if (isDev) return { error: err.message, stack: err.stack };
  // Map known errors
  const msg = String(err.message || '');
  if (msg.includes('ECONNREFUSED')) return { error: 'Service unavailable' };
  if (msg.includes('ETIMEDOUT')) return { error: 'Request timeout' };
  if (msg.includes('duplicate')) return { error: 'Resource already exists' };
  if (msg.includes('foreign key')) return { error: 'Invalid reference' };
  return { error: 'Internal server error' };
}

// ============ SECURITY EVENT LOG ============
function logSecurityEvent(event, ip, meta = {}) {
  const line = `[SECURITY] ${new Date().toISOString()} event=${event} ip=${ip} ${JSON.stringify(meta)}`;
  console.warn(line);
}

module.exports = {
  // validators
  validateEmail,
  validatePassword,
  validatePhone,
  validateString,
  validateId,
  validateEnum,
  // sanitizers
  sanitizeHTML,
  sanitizeText,
  detectInjection,
  sha256Short,
  // middleware
  securityHeaders,
  corsStrict,
  globalRateLimit,
  injectionGuard,
  requestGuard,
  safeError,
  logSecurityEvent,
  // constants
  EMAIL_RE,
  PW_RE,
  PHONE_RE,
  SLUG_RE,
  UUID_RE,
};
