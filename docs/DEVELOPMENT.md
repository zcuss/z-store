# Z Store — Development

## Local Quickstart

### Prerequisites

- Node.js 22+
- npm
- Optional: MySQL 8 (only for full-stack dev)
- Optional: Tailscale (for DB access over VPN)

### Setup

```bash
git clone https://github.com/zcuss/z-store.git
cd z-store

# Backend deps
cd backend && npm ci
cd ..

# Frontend has no build step — just serve
cd frontend/shop
node dev-server.js
# → http://localhost:3002
```

### Frontend dev-server

`frontend/shop/dev-server.js` (created during Z Store dev):

```js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/root/z-store/frontend/shop';
const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if(!f.startsWith(ROOT)){res.writeHead(403);return res.end();}
  fs.readFile(f,(err,data)=>{
    if(err){res.writeHead(404);return res.end('404');}
    res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  });
}).listen(3002,()=>console.log('dev :3002'));
```

### Database (optional)

For full-stack local dev, set `backend/.env`:

```ini
PORT=3001
DB_DRIVER=mysql
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=
DB_NAME=zcuss_zshop
JWT_S3CR3T=dev-only-secret-32-chars-min
```

Without DB, the dev API returns:

```json
{"error":"API offline in dev mode (no DB). Set DB_DRIVER=mysql + DB_HOST=... or test against cPanel via tunnel."}
```

The frontend falls back to `window.PRODUCTS` (from `products.js`) when API fails — local QA still works without backend.

### Backend start

```bash
cd backend
node server.js
# → http://localhost:3001
```

### Project structure

```
z-store/
├── backend/
│   ├── server.js       # 1786 LOC, 93 routes
│   ├── security.js     # 299 LOC, middleware
│   ├── schema*.sql     # DB migrations
│   └── test-*.sh       # Bash test suites
├── frontend/shop/
│   ├── *.html          # 18 pages
│   ├── styles.css      # 1500 LOC
│   ├── app.js          # 1000 LOC
│   ├── products.js     # 20-item fallback catalog
│   └── dev-server.js   # local dev server
└── docs/               # this folder
```

## Code Style

### JavaScript

- Vanilla ES2020, no build step
- 2-space indent
- Single quotes
- `const` by default, `let` if reassigned
- All top-level shared state prefixed `window.` to coexist with subpage scripts
- IIFE for module isolation (see `products.js`)

### CSS

- BEM-lite naming (`.prod-card`, `.pc-body`, `.pc-price`)
- 8px spacing grid
- CSS custom properties for tokens (`--bg`, `--text`, `--accent`)
- No preprocessor — pure CSS with `@media` queries
- Cache-bust via `?v=N` query on `<link rel="stylesheet">`

### HTML

- Semantic markup (`<header>`, `<main>`, `<aside>`, `<nav>`)
- `aria-label` on icon-only buttons
- `role="search"` on search inputs
- Skip link `<a class="skip-link" href="#main">`

## Common Tasks

### Add a new product category

1. Edit `frontend/shop/app.js` line ~42 — add to `CAT_ICONS` map
2. Edit `frontend/shop/index.html` — add sidebar `.sb-cat` button
3. Add seed entry in `backend/seed.sql` (or push via admin panel)

### Add a new API route

```js
// backend/server.js
app.post('/api/example', authMiddleware, async (req, res) => {
  try {
    const { field } = req.body;
    if (!sec.validateString(field)) return res.status(400).json({ error: 'bad input' });
    const [r] = await pool.query('INSERT INTO ... VALUES (?)', [field]);
    res.json({ id: r.insertId });
  } catch (e) {
    console.error('example:', e);
    res.status(500).json({ error: 'internal' });
  }
});
```

### Update styles.css cache-bust

```bash
# Bump version
sed -i 's/styles.css?v=N/styles.css?v=N+1/g' frontend/shop/*.html
git add frontend/shop/
git commit -m "chore: bump styles.css cache buster v=N → v=N+1"
git push
```

## Debugging

### Browser console

```js
// Inspect state
JSON.stringify({products: window.products?.length, cart: window.cart, user: window.user})

// Force re-render
applyFilterLocal()

// Trigger toast
toast('Test message', 'success')
```

### Network tab

Look for `/api/*` requests. Check status code, response body, request headers (especially `Authorization`).

### Server logs

```bash
ssh zcus2
pm2 logs z-store --lines 100
# or follow live:
pm2 logs z-store --raw
```

### Database

```bash
ssh zcus4
mysql -u zcuss_zshop -p zcuss_zshop
> SHOW TABLES;
> SELECT COUNT(*) FROM products;
> SELECT id, email, role FROM users ORDER BY id DESC LIMIT 10;
```

## Gotchas

- **`let products` collision** — if you add a new top-level `let products = ...` to `app.js` or any subpage, app.js will fail to parse. Use `window.products = ...` instead.
- **`fmtIDR` / `disc` collision** — same issue. Both files declare these as `const`. Wrap new modules in IIFE if they need to redefine.
- **Cloudflare strips headers** — `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy` may not appear in response through Cloudflare proxy. Set them in Cloudflare dashboard Transform Rules.
- **Midtrans SANDBOX** — public-facing sandbox returns dummy payment token. To test real flow, use Midtrans simulator dashboard.
- **MySQL TINYINT(1) for booleans** — `active = TRUE` may not match `active = 1` in older drivers. Use both.
- **localStorage quota** — 5MB per origin. Recent-viewed list capped at 20 items; wishlist unlimited but watch for quota.
- **Mobile bottom nav** — auto-hides on scroll up only. Reset on page change.

## Contributing

1. Fork repo
2. Branch: `git checkout -b feat/awesome`
3. Test locally: `bash backend/test-security.sh http://localhost:3001`
4. Commit: `git commit -m "feat: ..."`
5. PR to `main`
6. Wait for CI (security tests + lint)
7. Tuan reviews + merges
