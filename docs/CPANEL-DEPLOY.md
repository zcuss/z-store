# Z Store — cPanel Deployment Guide

> Deploy z-store ke cPanel shared hosting sebagai static frontend + MySQL DB. Backend Node.js tetep di VPS (VPS2 atau VPS1).

## Topology

```
Cloudflare CDN
  ├── zcus.biz.id (cPanel shared hosting)
  │     └── /shop/*         (static frontend — 18 HTML + CSS + JS)
  │     └── /shop-app/api/*  (reverse proxy → VPS Node.js backend)
  │
  └── *.trycloudflare.com  (Cloudflare Tunnel → VPS Node.js backend)
```

## Kenapa Pakai cPanel untuk Frontend?

- **Cheap** — shared hosting $3-5/bulan cukup untuk static files
- **Fast global** — cPanel biasanya udah pakai Cloudflare CDN
- **Reliable** — 99.9% uptime SLA dari provider
- **Backup otomatis** — most cPanel include daily backup

## Backend Tetap di VPS

- MySQL DB butuh persistent connection → pakai VPS
- Midtrans webhook receiver → perlu always-on → VPS
- Bot Telegram/Discord/WhatsApp → perlu always-on → VPS
- API endpoint dengan logic → VPS
- Real-time notifications (cron jobs) → VPS

## cPanel Setup

### 1. Upload Files via cPanel File Manager atau FTP

```bash
# Folder structure to upload:
/home/<username>/
└── public_html/
    └── shop/
        ├── index.html
        ├── product.html
        ├── orders.html
        ├── ... (all 18 HTML files)
        ├── styles.css
        ├── app.js
        ├── products.js
        ├── tw-components.css
        ├── manifest.json
        ├── favicon.svg
        ├── og-image.svg
        └── preview/
            ├── index.html
            └── ...
```

### 2. Set File Permissions

```bash
# Via SSH or File Manager
find public_html/shop -type d -exec chmod 755 {} \;
find public_html/shop -type f -exec chmod 644 {} \;
```

### 3. Configure Cloudflare for `zcus.biz.id`

#### Option A: Direct (Cloudflare proxied)

DNS:
```
Type    Name    Content                     Proxy
A       @       <cpanel-server-ip>          Proxied (orange cloud)
A       www     <cpanel-server-ip>          Proxied
```

SSL/TLS:
- Mode: **Full** (or Full Strict kalau pake Origin Certificate dari CF)
- Edge Certificates: Let's Encrypt auto-issued
- Always Use HTTPS: ON

#### Option B: cPanel as origin, Cloudflare Tunnel to VPS for API

DNS:
```
Type    Name              Content                     Proxy
A       @                 <cpanel-ip>                 Proxied
CNAME   shop-app          <tunnel-id>.cfargotunnel.com Proxied
```

### 4. Reverse Proxy `/shop-app/api/*` → VPS

cPanel punya Apache. Tambahkan `.htaccess` di `public_html/shop-app/`:

```apache
RewriteEngine On
RewriteRule ^api/(.*)$ https://<vps-tunnel>/api/$1 [P,L]
```

Atau kalau pakai Cloudflare Workers (recommended, no Apache config needed):

```js
// workers/zstore-api-proxy.js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/shop-app/api/')) {
      const newUrl = `https://<vps-tunnel>${url.pathname.replace('/shop-app', '')}${url.search}`;
      return fetch(newUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    }
    return fetch(request);
  }
};
```

### 5. Environment Variables (di VPS, bukan cPanel)

`/root/z-store/backend/.env`:
```ini
PORT=3001
DB_HOST=127.0.0.1  # atau Tailscale IP VPS4
DB_USER=zcuss_zshop
DB_PASSWORD=<secret>
DB_NAME=zcuss_zshop
DB_DRIVER=mysql

JWT_S3CR3T=<random-64-char-hex>
NODE_ENV=production

# Midtrans (production keys)
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_SERVER_KEY=Mid-server-XXXX
MIDTRANS_CLIENT_KEY=Mid-client-XXXX

# Email (Gmail SMTP)
GMAIL_USER=zcusgt@gmail.com
GMAIL_APP_PASS=<16-char-app-password>

# Telegram Bot
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_WEBHOOK_SECRET=<random>

# Discord Bot
DISCORD_BOT_TOKEN=<token>

# WhatsApp Business (Meta Cloud API)
WHATSAPP_TOKEN=<long-lived-token>
WHATSAPP_PHONE_ID=<phone-number-id>
WHATSAPP_WABA_ID=<waba-id>
```

### 6. SSL/TLS untuk VPS Backend

Gunakan Cloudflare Origin Certificate:
1. Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate
2. Save `cert.pem` dan `key.pem` ke VPS
3. Configure nginx untuk pakai cert itu

`/etc/nginx/sites-available/zstore.my.id.conf`:
```nginx
server {
  listen 443 ssl http2;
  server_name zstore.my.id;

  ssl_certificate /etc/ssl/cf-origin.pem;
  ssl_certificate_key /etc/ssl/cf-origin.key;

  location /shop-app/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    client_max_body_size 512k;
  }
}
```

## CI/CD Auto-Deploy

GitHub Actions workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy to cPanel

on:
  push:
    branches: [master]
    paths: ['frontend/shop/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Deploy frontend to cPanel via FTP
      - name: Sync frontend to cPanel
        uses: SamKirkland/FTP-Deploy-Action@v4.3.4
        env:
          FTP_SERVER: ${{ secrets.FTP_SERVER }}
          FTP_USERNAME: ${{ secrets.FTP_USERNAME }}
          FTP_PASSWORD: ${{ secrets.FTP_PASSWORD }}
        with:
          local-dir: frontend/shop/
          server-dir: public_html/shop/
          exclude: |
            **/.git/**
            **/node_modules/**

      # Trigger backend restart on VPS
      - name: Restart VPS backend
        uses: appleboy/ssh-action@v1
        env:
          HOST: ${{ secrets.VPS_HOST }}
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /root/z-store/backend
            git pull origin master
            pm2 restart z-store
```

## Manual Deploy (tanpa CI/CD)

### Step 1: Build Static Files

```bash
# Already built — static HTML/CSS/JS
ls frontend/shop/
```

### Step 2: Upload to cPanel

```bash
# Via FTP (lftp)
lftp -u user,pass ftp://zcus.biz.id <<EOF
mirror -R frontend/shop/ public_html/shop/
bye
EOF

# Or via rsync
rsync -avz -e ssh frontend/shop/ user@cpanel:/home/user/public_html/shop/
```

### Step 3: Update Backend on VPS

```bash
ssh vps2 'cd /root/z-store && git pull && pm2 restart z-store'
```

### Step 4: Verify

```bash
# Frontend
curl -I https://zcus.biz.id/shop/

# API (should proxy through to VPS)
curl -s https://zcus.biz.id/shop-app/api/health
```

## Rollback

```bash
# Via FTP — restore previous version
lftp -u user,pass ftp://zcus.biz.id <<EOF
rm -rf public_html/shop/
mirror -R backup-2026-06-19/shop/ public_html/shop/
bye
EOF

# VPS backend
ssh vps2 'cd /root/z-store && git checkout HEAD~1 && pm2 restart z-store'
```

## Monitoring

- Uptime monitoring: UptimeRobot / BetterStack → ping `/shop-app/api/health` every 5 min
- Error tracking: Sentry.io → install `@sentry/node` di backend
- Logs: `pm2 logs z-store` di VPS

## Cost Estimate (per month)

| Component | Cost |
|---|---|
| cPanel shared hosting | $3-5 |
| VPS2 (backend) | $5-10 |
| VPS4 (MySQL) | $5-10 |
| Cloudflare (free tier OK) | $0 |
| Domain (zcus.biz.id) | $1 |
| **Total** | **~$15-25/mo** |
