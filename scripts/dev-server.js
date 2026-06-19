#!/usr/bin/env node
// Z Store — Local dev server (static frontend, NO DB).
// Purpose: visual QA + interaction test without touching cPanel MySQL.
// Usage: node scripts/dev-server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = parseInt(process.argv[2] || process.env.PORT || 3002);
const ROOT = path.resolve(__dirname, '..', 'frontend');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/shop/';

  // Block API calls (no DB)
  if (urlPath.startsWith('/api') || urlPath.startsWith('/shop-app/api')) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API offline in dev mode (no DB). Set DB_DRIVER=mysql + DB_HOST=... or test against cPanel via tunnel.' }));
    return;
  }

  // Resolve file
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');

  // Map /shop -> frontend/shop
  if (!fs.existsSync(filePath)) {
    // Try fallback to /shop/<file>
    const alt = path.join(ROOT, 'shop', urlPath.replace(/^\/shop\//, ''));
    if (fs.existsSync(alt)) filePath = alt;
  }
  if (!fs.existsSync(filePath)) {
    // 404 fallback
    const notFound = path.join(ROOT, 'shop', '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      fs.createReadStream(notFound).pipe(res);
      log('404', urlPath, '-> 404.html');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + urlPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
  log(req.method, urlPath, '->', path.relative(ROOT, filePath));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nZ Store dev server (static only)`);
  console.log(`Listening:  http://127.0.0.1:${PORT}/`);
  console.log(`Shop:       http://127.0.0.1:${PORT}/shop/`);
  console.log(`Product:    http://127.0.0.1:${PORT}/shop/product.html?slug=...`);
  console.log(`Admin:      http://127.0.0.1:${PORT}/shop/admin.html`);
  console.log(`Orders:     http://127.0.0.1:${PORT}/shop/orders.html`);
  console.log(`FAQ:        http://127.0.0.1:${PORT}/shop/faq.html`);
  console.log(`API:        offline (run server.js for backend)\n`);
});

process.on('SIGINT', () => { console.log('\nShutting down...'); server.close(() => process.exit(0)); });
