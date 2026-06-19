#!/bin/bash
# VPS2 Fix Script — dijalankan langsung oleh Tuan via SSH/KVM/VNC
# Setelah ini jalan, VPS2 siap serve zcus.my.id

set -e

echo "=== [1/8] Update sistem + install tools ==="
apt-get update -qq
apt-get install -y ufw certbot python3-certbot-nginx acl -qq

echo "=== [2/8] Setup file permissions frontend ==="
# Fix www-data access ke frontend (root-owned directories)
chmod -R 755 /root/z-store
chmod -R 755 /root/z-store/frontend
chmod -R 755 /root/z-store/frontend/shop
chmod -R 755 /root/z-store/frontend/shop-app

# www-data needs read access specifically
setfacl -R -m u:www-data:rx /root/z-store/frontend/shop 2>/dev/null || chmod -R o+rx /root/z-store/frontend/shop

echo "=== [3/8] Move frontend ke /var/www (lebih clean) ==="
mkdir -p /var/www/zcus
cp -r /root/z-store/frontend/shop /var/www/zcus/shop
cp -r /root/z-store/frontend/shop-app /var/www/zcus/shop-app
chown -R www-data:www-data /var/www/zcus
chmod -R 755 /var/www/zcus

echo "=== [4/8] Update nginx config to use /var/www ==="
cat > /etc/nginx/sites-available/zcus.my.id.conf << 'NGINX'
server {
    listen 80;
    server_name zcus.my.id www.zcus.my.id;

    root /var/www/zcus;
    index index.html;

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    location /shop/ {
        alias /var/www/zcus/shop/;
        try_files $uri $uri/ =404;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location /shop-app/ {
        alias /var/www/zcus/shop-app/;
        try_files $uri $uri/ =404;
        expires 1h;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        client_max_body_size 1m;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3001/api/health;
    }

    location = / {
        return 302 /shop/;
    }

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    access_log /var/log/nginx/zcus.my.id.access.log;
    error_log /var/log/nginx/zcus.my.id.error.log;
}
NGINX

ln -sf /etc/nginx/sites-available/zcus.my.id.conf /etc/nginx/sites-enabled/
nginx -t && nginx -s reload
echo "  ✓ nginx reloaded"

echo "=== [5/8] Firewall setup ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
# MySQL jangan di-expose public
ufw deny 3306/tcp
# Allow SSH from VPS1 IP specifically (jika mau dibuka lagi)
# VPS1_PUBLIC_IP="47.237.219.112"  # uncomment + add if known
# ufw allow from 47.237.219.112 to any port 22 proto tcp
ufw --force enable
echo "  ✓ ufw enabled"

echo "=== [6/8] Setup systemd service untuk auto-restart node ==="
cat > /etc/systemd/system/zstore.service << 'SVC'
[Unit]
Description=Z Store Backend
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/z-store/backend
ExecStart=/usr/local/bin/node server.js
Restart=always
RestartSec=10
EnvironmentFile=/root/z-store/backend/.env
StandardOutput=append:/var/log/zstore.log
StandardError=append:/var/log/zstore.log

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable zstore.service
systemctl restart zstore.service
sleep 3
systemctl status zstore.service --no-pager | head -10

echo "=== [7/8] Generate SSL cert (perlu DNS resolved dulu) ==="
# Hanya bisa kalau zcus.my.id sudah resolve ke VPS2 IP
if dig +short zcus.my.id | grep -q "47.236.149.190"; then
    certbot --nginx -d zcus.my.id -d www.zcus.my.id --non-interactive --agree-tos -m admin@zcus.my.id
    echo "  ✓ SSL installed"
else
    echo "  ⚠ DNS belum resolve ke VPS2. SSL di-skip."
    echo "  Update DNS A record zcus.my.id → 47.236.149.190 dulu, lalu run:"
    echo "  certbot --nginx -d zcus.my.id -d www.zcus.my.id"
fi

echo "=== [8/8] Final check ==="
echo "Node service:"
systemctl is-active zstore.service
echo "Nginx test:"
nginx -t 2>&1 | tail -1
echo "Public test:"
curl -s -o /dev/null -w "  HTTP /shop/: %{http_code}\n" -H "Host: zcus.my.id" http://127.0.0.1/shop/
curl -s -o /dev/null -w "  HTTP /api/health: %{http_code}\n" -H "Host: zcus.my.id" http://127.0.0.1/api/health

echo ""
echo "════════════════════════════════════"
echo "✅ VPS2 setup complete"
echo "════════════════════════════════════"
echo ""
echo "Setelah ini:"
echo "1. Update DNS A record: zcus.my.id → 47.236.149.190"
echo "2. Tunggu DNS propagate (~5 menit)"
echo "3. Run: certbot --nginx -d zcus.my.id -d www.zcus.my.id"
echo "4. Test: https://zcus.my.id/shop/"
echo ""