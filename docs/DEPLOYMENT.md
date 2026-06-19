# Z Store — Deployment

## Production Topology

```
Cloudflare (CDN + Tunnel)
    │
    ├─── https://zcus.biz.id         → VPS2 (47.236.149.190, apps + nginx)
    │                                    ├── nginx:443 → /shop/* → Express static
    │                                    └── nginx:443 → /shop-app/* → Express :3001
    │
    ├─── https://zcus.my.id          → alias of above (via Cloudflare redirect/page rule)
    │
    └─── https://*.trycloudflare.com → dev tunnels (ephemeral)
```

## VPS2 — Application Server

**Host**: `zcus2` (47.236.149.190)  
**Tailscale IP**: `100.116.141.100`  
**OS**: Ubuntu 22.04 LTS  
**Node**: v22.22.1  
**Process manager**: PM2 (`z-store`)

### Initial Setup

```bash
# SSH
ssh zcus2

# Install deps
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs mysql-client nginx certbot
sudo npm install -g pm2

# Clone repo
sudo mkdir -p /root/z-store
sudo chown -R $USER:$USER /root/z-store
git clone https://github.com/zcuss/z-store.git /root/z-store
cd /root/z-store/backend && npm ci --production
```

### Environment

`/root/z-store/backend/.env`:

```ini
PORT=3001
NODE_ENV=production
JWT_S3CR3T=<64-char-random-hex>

# MySQL (VPS4 over Tailscale)
DB_DRIVER=mysql
DB_HOST=100.100.68.2
DB_USER=zcuss_zshop
DB_PASSWORD=<secret>
DB_NAME=zcuss_zshop

# Midtrans (SANDBOX for dev, prod keys for live)
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-XXXXXXXXXXXX
MIDTRANS_CLIENT_KEY=SB-Mid-client-XXXXXXXXXXXX

# Email (Gmail SMTP via App Password)
GMAIL_USER=zcusgt@gmail.com
GMAIL_APP_PASS=<16-char-app-password>
```

### Start

```bash
cd /root/z-store/backend
chmod +x start.sh
./start.sh
# or: pm2 start server.js --name z-store
#     pm2 save
#     pm2 startup systemd
```

### nginx reverse proxy

`/etc/nginx/sites-available/z-store`:

```nginx
server {
  listen 443 ssl http2;
  server_name zcus.biz.id www.zcus.biz.id;
  
  ssl_certificate /etc/letsencrypt/live/zcus.biz.id/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/zcus.biz.id/privkey.pem;
  
  # Static frontend
  location /shop/ {
    alias /root/z-store/frontend/shop/;
    expires 1h;
    add_header Cache-Control "public, max-age=3600";
  }
  
  # Cache-bust for css/js
  location ~* /shop/(.*)\.(css|js)$ {
    alias /root/z-store/frontend/shop/$1.$2;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
  
  # API
  location /shop-app/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
    client_max_body_size 512k;
  }
}
```

Enable: `sudo ln -s /etc/nginx/sites-available/z-store /etc/nginx/sites-enabled/ && sudo nginx -s reload`.

### Cert (Let's Encrypt)

```bash
sudo certbot --nginx -d zcus.biz.id -d www.zcus.biz.id
```

### Deploy from GitHub

```bash
cd /root/z-store
git fetch origin
git reset --hard origin/main   # VPS2 local branch is `master`, GitHub default is `main`
pm2 restart z-store
nginx -s reload
```

> **Note**: VPS2 local repo branch is `master`. GitHub default branch is `main`. Use `git fetch origin && git reset --hard origin/main` instead of `git pull`.

## VPS4 — Database Server

**Host**: `8.215.192.96`  
**Tailscale IP**: `100.100.68.2` (system tailscaled — DO NOT kill)  
**OS**: Ubuntu 22.04  
**DB**: MySQL 8.x

### Setup

```bash
ssh zcus4
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Create db + user
mysql -u root -p <<SQL
CREATE DATABASE zcuss_zshop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'zcuss_zshop'@'100.116.141.100' IDENTIFIED BY 'ZcusShop2026!Db';
GRANT ALL PRIVILEGES ON zcuss_zshop.* TO 'zcuss_zshop'@'100.116.141.100';
FLUSH PRIVILEGES;
SQL
```

### Schema migration

```bash
cd /root/z-store/backend
for f in schema.sql schema-v4.sql schema-v5.sql schema-v6-security.sql schema-v7-promos.sql; do
  echo "→ $f"
  mysql -u zcuss_zshop -p'ZcusShop2026!Db' zcuss_zshop < "$f" || break
done
```

## cPanel — Static fallback

`zcus.biz.id` is also pointed at cPanel shared hosting (`162.0.209.225:21098`) as a fallback if VPS2 is down.

The cPanel hosts a copy of `/frontend/shop/*` (without the API). Useful for "lite" mode where products come from a static JSON.

## Local Dev (VPS1 / this host)

```bash
cd /root/z-store/frontend/shop
node dev-server.js
# → http://localhost:3002
```

The dev server proxies `/api/*` to production (`https://zcus.biz.id/shop-app/api`) via the `API` constant in `app.js`:

```js
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? location.origin + '/api'              // dev mode (will 503 without local DB)
  : 'https://zcus.biz.id/shop-app/api';   // production proxy
```

## Health checks

```bash
# App
curl https://zcus.biz.id/shop-app/api/health
# → {"status":"ok","node":"v20.18.1","db":true,"tables":23,...}

# Frontend
curl -I https://zcus.biz.id/shop/
# → HTTP/2 200, content-type: text/html
```

## Rollback

```bash
# VPS2
cd /root/z-store
git log --oneline -5
git reset --hard <previous-commit-sha>
pm2 restart z-store
nginx -s reload

# Verify
curl -I https://zcus.biz.id/shop/
```

## Backup

```bash
# VPS4 — daily mysqldump to local disk
0 3 * * * /usr/bin/mysqldump -u zcuss_zshop -p'ZcusShop2026!Db' zcuss_zshop | gzip > /backup/zcuss_$(date +\%F).sql.gz
```

## Known operational notes

- **VPS2 SSH may go down mid-session** — reset from provider panel if unresponsive.
- **Cloudflare Tunnel** — if VPS2 is unreachable via public domain, check tunnel daemon: `systemctl status cloudflared` on VPS2.
- **MySQL connection limit** — VPS4 my.cnf `max_connections=200` (raise to 500 if PM2 scales).
- **PM2 restart loop** — if `z-store` keeps restarting, check `pm2 logs z-store --lines 100` for unhandled promise.
