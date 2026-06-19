# Z Store — Bot Catalog Templates

> Catalog + button templates for **Discord**, **Telegram**, and **WhatsApp** sales channels.
> Goal: unified Z Store branding across all channels. Bot yang **terlihat natural** (especially WhatsApp — humanized, bukan chatbot robotic).

---

## 1. Discord — Embed + Buttons

### 1.1 Setup

1. Buat Discord Application di https://discord.com/developers/applications
2. Tambah **Bot** → copy token → set ke env `DISCORD_BOT_TOKEN`
3. Invite bot ke server via OAuth2 URL dengan permission: `Send Messages`, `Embed Links`, `Use Slash Commands`
4. Enable **Message Content Intent** di Bot settings

### 1.2 Slash Commands (recommended)

```
/catalog            — List featured products (paginated)
/catalog [category] — Filter by category (AI Tools, Voucher, dll)
/product [slug]     — Detail 1 produk + Buy button
/help                — Show bantuan CS
/order [id]         — Track order by ID
```

### 1.3 Embed Template — Single Product

```json
{
  "embeds": [{
    "title": "Claude Pro Annual License",
    "description": "Anthropic's most capable AI assistant. 5x more usage vs free, priority access to Claude 3.5 Sonnet & Opus, early access to new features.",
    "url": "https://5.zcus.biz.id/shop/product.html?slug=claude-pro-annual",
    "color": 5814783,
    "thumbnail": { "url": "https://5.zcus.biz.id/shop/og/claude-pro.png" },
    "fields": [
      { "name": "💰 Price", "value": "**Rp 2.400.000** ~~Rp 3.000.000~~ (-20%)", "inline": true },
      { "name": "📦 Format", "value": "Email + Password\nInstant delivery", "inline": true },
      { "name": "🛡️ Garansi", "value": "30 hari replacement / refund", "inline": true },
      { "name": "✅ Terjual", "value": "312 sold", "inline": true },
      { "name": "⭐ Rating", "value": "4.9 / 5 (47 reviews)", "inline": true },
      { "name": "⚡ Instant", "value": "Delivery <10 menit via email", "inline": true }
    ],
    "image": { "url": "https://5.zcus.biz.id/shop/banner/claude-pro-banner.jpg" },
    "footer": { "text": "Z Store — Premium Digital Marketplace" },
    "timestamp": "2026-06-19T20:00:00Z"
  }],
  "components": [
    {
      "type": 1,
      "components": [
        { "type": 2, "style": 5, "label": "💬 Tanya CS", "url": "https://discord.gg/zstore" },
        { "type": 2, "style": 5, "label": "🛒 Lihat di Toko", "url": "https://5.zcus.biz.id/shop/product.html?slug=claude-pro-annual" },
        { "type": 2, "style": 3, "label": "🛒 Beli Sekarang", "custom_id": "buy_claude_pro_annual", "emoji": { "name": "🛒" } }
      ]
    }
  ]
}
```

**Notes:**
- `style: 5` = Link button (URL), `style: 3` = Success/green (action)
- `custom_id` triggers modal for quantity selection
- Color 5814783 = `#58B6F7` (Z Store brand sky blue)

### 1.4 Embed Template — Catalog Grid

```json
{
  "embeds": [{
    "title": "🛍️ Katalog Z Store — Juni 2026",
    "description": "Featured minggu ini — diskon hingga **60%** untuk produk pilihan.",
    "color": 5814783,
    "fields": [
      {
        "name": "🤖 AI Tools",
        "value": "• Claude Pro Annual — Rp 2.400.000 (-20%)\n• ChatGPT Plus 1Y — Rp 1.850.000 (-23%)\n• Midjourney Standard — Rp 1.750.000 (-20%)",
        "inline": false
      },
      {
        "name": "🎟️ Voucher",
        "value": "• Hosting 1 Tahun + Domain — Rp 399.000",
        "inline": false
      },
      {
        "name": "🛠️ Jasa",
        "value": "• Setup VPS + Cloudflare Tunnel — Rp 199.000",
        "inline": false
      }
    ],
    "footer": { "text": "Auto-refresh tiap Senin 09:00 WIB • /catalog untuk full list" }
  }],
  "components": [{
    "type": 1,
    "components": [
      { "type": 2, "style": 3, "label": "🛒 Browse All Products", "url": "https://5.zcus.biz.id/shop/" }
    ]
  }]
}
```

---

## 2. Telegram — Inline Keyboard Bot

### 2.1 Setup

1. Chat ke **@BotFather** di Telegram → `/newbot` → catat **token**
2. Set webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://5.zcus.biz.id/api/webhook/telegram`
3. Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`

### 2.2 Commands

```
/start   — Welcome message + catalog button
/catalog — Featured products
/product <id> — Detail produk
/orders  — My orders (auth required)
/help    — Bantuan
```

### 2.3 Inline Keyboard — Single Product

```json
{
  "chat_id": "{{user_chat_id}}",
  "photo": "https://5.zcus.biz.id/shop/banner/claude-pro-banner.jpg",
  "caption": "🤖 *Claude Pro Annual License*\n\nAnthropic's most capable AI. 5x usage, priority access, early features.\n\n💰 *Rp 2.400.000* ~~Rp 3.000.000~~ (-20%)\n📦 Email + Password • Instant <10 min\n🛡️ Garansi 30 hari replacement/refund\n⭐ 4.9/5 (47 reviews) • 312 sold\n\n_Powered by Z Store_",
  "parse_mode": "Markdown",
  "reply_markup": {
    "inline_keyboard": [
      [
        { "text": "💬 Tanya CS", "url": "https://t.me/zstore_support" },
        { "text": "🛒 Lihat di Toko", "url": "https://5.zcus.biz.id/shop/product.html?slug=claude-pro-annual" }
      ],
      [
        { "text": "🛒 Beli Sekarang — Rp 2.400.000", "callback_data": "buy:claude_pro_annual" }
      ],
      [
        { "text": "📦 Lihat Katalog Lengkap", "url": "https://5.zcus.biz.id/shop/" }
      ]
    ]
  }
}
```

### 2.4 Inline Keyboard — Catalog (multiple products in grid)

```json
{
  "chat_id": "{{user_chat_id}}",
  "text": "🛍️ *Katalog Z Store — Juni 2026*\n\nDiskon hingga 60% untuk produk pilihan:",
  "parse_mode": "Markdown",
  "reply_markup": {
    "inline_keyboard": [
      [{ "text": "🤖 Claude Pro — Rp 2.400.000", "callback_data": "product:9" }],
      [{ "text": "💬 ChatGPT Plus 1Y — Rp 1.850.000", "callback_data": "product:10" }],
      [{ "text": "🎨 Midjourney Standard — Rp 1.750.000", "callback_data": "product:11" }],
      [{ "text": "🎟️ Hosting + Domain — Rp 399.000", "callback_data": "product:18" }],
      [{ "text": "🛠️ VPS Setup — Rp 199.000", "callback_data": "product:19" }],
      [{ "text": "📦 Lihat Semua di Toko →", "url": "https://5.zcus.biz.id/shop/" }]
    ]
  }
}
```

### 2.5 Welcome Message (on /start)

```
Halo! 👋 Selamat datang di Z Store — marketplace produk digital premium.

Yang bisa kamu lakukan di sini:
🛒 Beli akun AI premium (Claude, ChatGPT, Midjourney)
🎟️ Voucher hosting & domain
🛠️ Jasa setup VPS / Cloudflare Tunnel
💎 Joki game / design / content

Mulai dari katalog di bawah ini:
```

---

## 3. WhatsApp — **Humanized**, Bukan Bot

> **PENTING:** WhatsApp bukan tempat bot-flow formal. User di WA expect ngobrol sama manusia. Templates ini di-handle oleh **admin/CS staff manual** dengan bantuan template snippet di bawah.

### 3.1 Setup WhatsApp Business API

1. Daftar Meta WhatsApp Business API di https://business.facebook.com/
2. Verify business + setup phone number
3. Get access token + WABA ID + Phone Number ID
4. Env: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_WABA_ID`

### 3.2 Auto-Reply (Template Messages — WA-approved only)

Template WA-approved (perlu submit ke Meta dulu):

```
Halo {{1}}! 👋
Selamat datang di Z Store — marketplace produk digital premium.

Kamu bisa langsung order via link di bawah ini, atau balas chat ini kalau ada yang mau ditanya dulu.

🛒 Katalog: https://5.zcus.biz.id/shop
💬 CS online: Senin-Minggu 09:00-22:00 WIB
```

### 3.3 Template Snippets for CS Staff (Copy-Paste)

**Sapaan awal (variasi, biar gak kaku):**

```
Halo kak {{nama}}! 👋
Z Store sini — marketplace produk digital premium.
Lagi cari-cari apa nih? Aku bantu cek dulu ya 🙏
```

```
Haii {{nama}} 👋
Selamat datang di Z Store. Kalau ada yang mau ditanyain dulu, atau langsung liat-liat katalog juga boleh 😊

🛒 https://5.zcus.biz.id/shop
```

```
Halo {{nama}} 🙌
Mau order produk digital ya? Bisa langsung klik link katalog di bawah, atau kalau bingung mau pilih yang mana, kabarin aja lagi ya — aku bantu recommend.

🛒 https://5.zcus.biz.id/shop
```

**Balesan pertanyaan umum:**

```
Untuk produk digital premium kami:
🤖 AI tools (Claude, ChatGPT, Midjourney)
🎟️ Voucher (Hosting, Domain)
🛠️ Jasa (Setup VPS, Tunnel)
💎 Joki (Game rank, design, content)

Lagi butuh yang mana nih kak? 😊
```

**Rekomendasi produk:**

```
Hmm kalau buat AI, recommended banget nih Claude Pro Annual. Worth it banget buat daily use, 5x lebih murah dari langganan langsung ke Anthropic. Lagi diskon 20% cuma Rp 2.400.000.

Detail: https://5.zcus.biz.id/shop/product.html?slug=claude-pro-annual

Mau di-checkout?
```

```
Kalau buat design / image generation, Midjourney Standard udah paling worth. 1 tahun akses, hemat dibanding bayar bulanan. Lagi Rp 1.750.000.

Detail: https://5.zcus.biz.id/shop/product.html?slug=midjourney-standard-1y
```

**Konfirmasi order:**

```
Siap kak {{nama}}, order kamu udah masuk:

📦 {{nama_produk}} x{{qty}}
💰 Total: Rp {{total}}
🛡️ Garansi 30 hari
⚡ Dikirim <10 menit ke email kamu

Lanjut checkout di sini ya: https://5.zcus.biz.id/shop/cart
```

**Follow-up setelah order:**

```
Halo {{nama}} 👋 Orderan {{order_id}} udah sampai di email kamu belum? Coba cek inbox + spam folder ya.

Kalau udah sampai, test login dulu produknya. Kalau ada masalah apa-apa kabarin lagi 🙏
```

**Handling complaint:**

```
Oh iya {{nama}}, aku bantu cek dulu ya order {{order_id}}...

[Buka dashboard admin, cek status]

[Bila ada masalah]: Waduh maaf banget kak, kebetulan stok untuk akun {{nama_produk}} baru batch kemarin ada trouble dari supplier. Aku langsung ganti baru ya, atau refund 100%? Mana yang kamu prefer?
```

**Closing (ramah):**

```
Siap kak, ditunggu order berikutnya ya 🙏
Kalau ada apa-apa, langsung chat aja — kami standby 24/7.
Have a good day! ✨
```

### 3.4 Anti-Bot Patterns (Hindari!)

❌ **JANGAN** pakai kalimat template kaku kayak:

```
"Pesan Anda telah diterima. Mohon menunggu customer service kami untuk konfirmasi. Estimasi waktu respon 5-10 menit."
```

→ Terlalu robotic, kayak CS Indosat.

❌ **JANGAN** auto-reply terlalu cepat (kurang dari 5 detik):

```
User: "halo"
Bot: [instant] "Selamat datang di Z Store, ada yang bisa dibantu?"
```

→ User langsung tau itu bot.

✅ **LAKUKAN**:

```
User: "halo"
CS: [5-30 detik kemudian] "halo kak 👋 ada yang bisa dibantu?"
```

→ Terasa manusia, ada delay natural.

✅ Pakai **emoji secukupnya** (jangan spam): 👋 🙏 😊 ✨ 🎉 ❤

✅ **Typo natural sesekali** (opsional, jangan berlebihan). Real manusia ngetik cepat.

✅ **Voice notes** untuk penjelasan panjang (opsional).

✅ **Seling dengan bahasa informal** (kak, bang, bro, sis, gan, sesuai customer).

---

## 4. Multi-Channel Integration

API backend expose:

```
GET  /api/integrations              — List active channels for user
POST /api/integrations/telegram     — Connect Telegram bot
POST /api/integrations/whatsapp/qr  — Generate WhatsApp QR for scan
GET  /api/integrations/whatsapp/qr/:session — Check QR scan status
POST /api/integrations/discord      — Connect Discord bot
DELETE /api/integrations/:id        — Disconnect
```

Webhook handlers:

```
POST /api/webhook/telegram    — Telegram bot callback queries
POST /api/webhook/whatsapp    — WhatsApp Business webhook (delivery, read receipts)
POST /api/webhook/discord     — Discord interactions
```

User link via `/api/auth/<platform>` after login — see [docs/AUTH.md](./AUTH.md).

---

## 5. Analytics & Monitoring

Per-channel conversion tracking:

- `/api/analytics/sales?channel=telegram&from=2026-06-01&to=2026-06-30`
- `/api/analytics/sales?channel=discord&from=...&to=...`
- `/api/analytics/sales?channel=whatsapp&from=...&to=...`

Compare conversion rates to optimize which channel gets more push.

---

## 6. Moderation Rules

Untuk semua channel:

- **No spam / promo judi / scam** → instant ban
- **No harga di luar katalog** (semua harga via official link)
- **Testimoni / review harus asli** (admin verify sebelum dipromote)
- **CS sopan, profesional, tidak toxic**
- **Refund dispute**: admin Z Store = penengah final

Lapor pelanggaran ke admin via `/admin` panel atau `report@zcussxyz` (private email).

---

## 7. Roadmap

- [ ] AI auto-reply untuk WhatsApp (qualify leads, tangani FAQ umum, escalate ke CS untuk pertanyaan spesifik)
- [ ] Voice note untuk joki progress update
- [ ] Telegram Stars / TON payment integration
- [ ] Discord slash command untuk bulk order (untuk reseller)
- [ ] WhatsApp Catalog sync (auto-update dari /api/products)

---

_Last updated: 2026-06-19_
_Owner: Tuan Z (admin@zcussxyz)_
