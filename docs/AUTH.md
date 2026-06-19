# Z Store — Account & Auth Flow

> Multi-platform account linking. Email + Password jadi primary, OAuth (Google/Telegram/Discord/WhatsApp) jadi secondary.
> Satu akun Z Store = bisa di-access dari semua platform sekaligus.

---

## 1. Primary: Email + Password (wajib OTP verify)

### 1.1 Register

```
POST /api/auth/register
Body: { email, password, name?, role?: 'buyer'|'seller' }
```

- Password: minimal 8 char, harus ada huruf + angka
- Email harus valid format
- Setelah register, OTP otomatis dikirim ke email (jika `GMAIL_APP_PASS` env set; otherwise console.log untuk dev)
- Response:

```json
{
  "user": { "id": 1, "email": "...", "name": "...", "role": "buyer" },
  "token": "eyJhbGciOi...",
  "requires_verification": true,
  "otp_sent": true,
  "message": "Registrasi berhasil. Cek email untuk kode verifikasi (10 menit berlaku)."
}
```

### 1.2 Verify Email (wajib sebelum full access)

```
POST /api/auth/otp/request
Body: { email, purpose: 'verify' }

POST /api/auth/otp/verify
Body: { email, otp, purpose: 'verify' }
```

- OTP 6 digit, valid 10 menit, max 3 attempts per email per 10 min
- Setelah verify, `email_verified = TRUE`
- Frontend bisa tampilkan OTP modal setelah login/register

### 1.3 Login

```
POST /api/auth/login
Body: { email, password }
```

- Account lockout: 5 failed attempts → lock 15 menit
- Response:

```json
{
  "user": {...},
  "token": "eyJ...",
  "requires_verification": true,  // false jika email_verified
  "message": "Email belum diverifikasi. Cek inbox untuk kode OTP."
}
```

- Frontend: kalau `requires_verification=true`, tampilkan OTP modal sebelum kasih akses full

### 1.4 Password Reset (via OTP)

```
POST /api/auth/otp/request  Body: { email, purpose: 'reset' }
POST /api/auth/otp/verify   Body: { email, otp, purpose: 'reset' }  → returns: "OTP valid, lanjut reset password"
POST /api/auth/reset-password  Body: { email, otp, new_password }
```

---

## 2. Secondary: OAuth Linking

### 2.1 Google OAuth

```
POST /api/auth/google
Body: {
  credential: "<Google ID token>",   // or legacy dev mode:
  google_id, email, name, avatar_url
}
```

- Email otomatis ter-verifikasi (Google sudah verify)
- Kalau email sudah ada di user lain → link ke existing user
- Auto-update avatar kalau Google kasih

### 2.2 Telegram Login Widget

```
POST /api/auth/telegram
Body: {
  id: 123456789,                  // telegram user id
  username: "johndoe",            // optional
  first_name: "John",             // optional
  last_name: "Doe",               // optional
  photo_url: "https://...",       // optional
  auth_date: 1234567890,         // unix timestamp
  hash: "abc123...",              // HMAC-SHA256 sig (verify with bot token)
  email: "john@example.com",      // optional (requires Telegram email scope permission)
  email_verified: true            // optional
}
```

- Verify HMAC dengan bot token (recommended). Untuk dev, skip hash.
- Telegram email scope butuh permission khusus dari BotFather (`@BotFather /setprivacy`).
- Link ke existing user kalau `linked_telegram_id` OR `email` sama.

### 2.3 Discord OAuth2

```
POST /api/auth/discord
Body: {
  access_token: "<Discord OAuth2 token>",   // recommended
  // or legacy dev mode:
  id: "1234567890", username: "johndoe", email: "john@example.com", avatar: "abc123"
}
```

- Backend panggil `https://discord.com/api/users/@me` untuk verify token + fetch profile
- Avatar di-resolve dari `https://cdn.discordapp.com/avatars/{id}/{avatar}.{ext}`
- Email verified kalau `verified: true` di Discord response
- Link ke existing user kalau `linked_discord_id` OR `email` sama

### 2.4 WhatsApp Business

```
POST /api/auth/whatsapp
Body: {
  phone: "+6281234567890",                // E.164 format
  name: "John Doe",                       // optional (from WA profile)
  phone_number_id: "12345...",           // WA Business phone number ID
  whatsapp_business_id: "67890...",      // WA Business Account ID
  access_token: "<long-lived token>"     // from WA Embedded Signup
}
```

- Phone validation: `+\d{7,15}` (E.164)
- WA baru → bikin user tanpa email (`email = NULL`, `email_verified = FALSE`)
- User bisa tambah email + password via Settings setelah login
- Auto-merge ke existing user kalau `linked_whatsapp_number` sama

---

## 3. Account Linking (Cross-Platform Sync)

### 3.1 Status Linked Platforms

```
GET /api/auth/platforms  (auth required)

Response:
{
  "platforms": {
    "web":       { "linked": true, "identifier": "user@x.com", "verified": true, "primary": true },
    "telegram":  { "linked": true, "identifier": "123456789", "bot": { "username": "zstore_bot" } },
    "whatsapp":  { "linked": false },
    "discord":   { "linked": true, "identifier": "9876543210", "bot": {...} },
    "google":    { "linked": true, "verified": true }
  }
}
```

### 3.2 Link Platform to Existing Account

```
POST /api/auth/link
Auth: Bearer
Body: { platform: 'telegram'|'whatsapp'|'discord', identifier: '...' }
```

- Conflict check: kalau identifier sudah di-link ke user lain → 409
- Updates `users.linked_<platform>_id` column

### 3.3 Unlink

```
POST /api/auth/unlink
Auth: Bearer
Body: { platform: 'telegram'|'whatsapp'|'discord' }
```

- Sets `linked_<platform>_id = NULL`
- Disables `platform_integrations` row

### 3.4 Example: User Links Telegram to Existing Email Account

```
1. User register via email/password → user #1
2. User login ke web, navigate Settings → "Link Telegram"
3. Frontend render Telegram Login Widget: https://oauth.telegram.org/auth/widget?bot_id=...
4. Telegram callback returns { id, first_name, hash, auth_date, ... }
5. Frontend POST /api/auth/telegram with the payload
6. Backend: find user by linked_telegram_id OR email → found user #1
7. Backend UPDATE users SET linked_telegram_id = telegram.id WHERE id = 1
8. Response: user + token (now user has both email AND telegram linked)
```

---

## 4. Security Considerations

### 4.1 JWT Lifetime

- Access token: **30 hari** (long-lived, mobile-friendly)
- Logout: blacklist token via `/api/auth/logout`
- Logout all: `/api/auth/logout-all`

### 4.2 Rate Limits

```
/api/auth/register:    5 / hour / IP
/api/auth/login:       10 / 15min / IP (account lockout after 5 failed)
/api/auth/google:      15 / 10min / IP
/api/auth/telegram:    15 / 10min / IP
/api/auth/discord:     15 / 10min / IP
/api/auth/whatsapp:    10 / 10min / IP
/api/auth/otp/request: 3 / 10min / email
/api/auth/otp/verify:  5 / 10min / IP
/api/auth/link:        10 / hour / IP
```

### 4.3 Required Email Verification

Endpoints requiring `email_verified=TRUE`:
- `/api/orders/checkout` (purchase)
- `/api/seller/*` (seller features)
- `/api/admin/*` (admin features)
- `/api/auth/withdraw`

Endpoints NOT requiring verification (read-only):
- `/api/auth/me`
- `/api/products/*` (browse)
- `/api/orders/me` (view history)

If user hits restricted endpoint without verification: `403 { error: 'email_verified required', verify_url: '/shop/settings' }`

### 4.4 Audit Log

All auth events logged to `security_audit_log` table:
- `login_success`, `login_failed`, `login_failed_invalid_user`
- `register_success`, `register_error`
- `platform_link`, `platform_unlink`
- `password_change`, `email_verified`
- `2fa_setup`, `2fa_enable`, `2fa_disable`

---

## 5. Database Schema

```sql
-- users table (existing, extended)
ALTER TABLE users
  ADD COLUMN google_id VARCHAR(255) UNIQUE NULL,
  ADD COLUMN linked_telegram_id VARCHAR(50) NULL,
  ADD COLUMN linked_whatsapp_number VARCHAR(20) NULL,
  ADD COLUMN linked_discord_id VARCHAR(50) NULL,
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN totp_secret VARCHAR(255) NULL,
  ADD COLUMN totp_enabled BOOLEAN DEFAULT FALSE;

-- platform_integrations (existing)
CREATE TABLE platform_integrations (
  id INT PK, owner_id INT, platform ENUM('telegram','whatsapp','discord'),
  enabled BOOL, status VARCHAR(20), config JSON, last_connected_at TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

---

## 6. Frontend Flow

### 6.1 Login Modal (index.html)

```js
// After login response:
if (res.requires_verification) {
  showOtpModal(res.user.email, 'verify');
  return;
}
localStorage.setItem('zcus_token', res.token);
window.location.reload();
```

### 6.2 OTP Modal (post-login)

```js
async function verifyOtp(email, otp, purpose = 'verify') {
  const r = await fetch(API + '/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, purpose })
  });
  const d = await r.json();
  if (d.verified) {
    localStorage.setItem('zcus_token', d.token);
    window.location.reload();
  } else {
    showError(d.error);
  }
}
```

### 6.3 Settings Page — Linked Platforms

```js
const platforms = await fetch(API + '/auth/platforms', { headers: auth }).then(r => r.json());
// Render: web (primary), telegram, discord, whatsapp, google
// For each unlinked: show "Link" button → opens OAuth flow
// For each linked: show "Unlink" button
```

---

## 7. Migration Notes

Existing users dengan `email_verified = TRUE` (set via Google OAuth or manual admin) tetap valid.

Existing users yang belum verified (e.g. legacy registrations sebelum feature ini) → next login akan trigger `requires_verification=true` → mereka harus verify email untuk full access.

Admin tools (TODO):
- `/api/admin/users/:id/verify-email` — admin manually mark verified (untuk bulk migration)
- `/api/admin/audit-log?event=login_failed&from=...` — investigate suspicious activity

---

_Last updated: 2026-06-19_
