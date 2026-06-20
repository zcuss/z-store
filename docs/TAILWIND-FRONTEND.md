# Z Store — Tailwind Frontend (shadcn-style)

> **Status:** Setup script + utility CSS + Tailwind config ready. Component library written. Page-level migration is incremental (style.css still serves as fallback).

## Why Tailwind

- **Productivity** — no context-switching between HTML/CSS
- **Consistency** — design tokens via `tailwind.config.js`
- **Bundle size** — only used classes shipped
- **Slack professional minimalism** — utility classes fit naturally (small radius, low color palette, tight spacing)

## Why shadcn-style components

- **Own the code** — copy-paste, not locked-in npm dep
- **Composable** — Radix UI primitives under the hood
- **Themeable** — CSS variables drive light/dark

## Setup

```bash
cd frontend/shop
# Tailwind standalone (no build step needed via CDN script)
echo '<script src="https://cdn.tailwindcss.com"></script>' >> all-pages.html
# Or use pre-built tailwind.min.css for production
```

`tailwind.config.js`:

```js
module.exports = {
  content: ['./*.html', './src/**/*.{js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Slack-inspired palette
        bg: { DEFAULT: '#0a0a0b', soft: '#131316', elev: '#1c1c1f', hover: '#222226' },
        border: { DEFAULT: 'rgba(255,255,255,0.08)', hover: 'rgba(255,255,255,0.16)' },
        text: { DEFAULT: '#fafafa', 2: '#a1a1aa', dim: '#71717a', mute: '#52525b' },
        accent: { DEFAULT: '#38bdf8', 2: '#7dd3fc', dark: '#0284c7', soft: 'rgba(56,189,248,0.1)' },
        success: '#10b981', warn: '#f59e0b', danger: '#ef4444',
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '8px', lg: '10px' },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'monospace'],
      },
      spacing: { /* 8px grid — Tailwind default OK */ },
    },
  },
};
```

## Component Library (`frontend/shop/tw-components.css`)

Pure CSS, shadcn-style. Use via `<button class="btn btn-primary">`.

### Buttons
```html
<button class="btn btn-primary">Save</button>
<button class="btn btn-secondary">Cancel</button>
<button class="btn btn-ghost">Skip</button>
<button class="btn btn-danger">Delete</button>
<button class="btn btn-primary" disabled>...</button>
```

### Cards
```html
<div class="card">
  <div class="card-header"><h3>Title</h3></div>
  <div class="card-body">...</div>
  <div class="card-footer">...</div>
</div>
```

### Inputs
```html
<input class="input" placeholder="Email" />
<textarea class="input" rows="3"></textarea>
<select class="input"><option>...</option></select>
```

### Badges
```html
<span class="badge badge-accent">NEW</span>
<span class="badge badge-success">Verified</span>
<span class="badge badge-warn">Pending</span>
<span class="badge badge-danger">Failed</span>
```

### Modals
```html
<div class="modal-backdrop" id="m1"></div>
<div class="modal" id="m1-modal">...</div>
```

### Tabs
```html
<div class="tabs">
  <button class="tab tab-active" data-tab="a">A</button>
  <button class="tab" data-tab="b">B</button>
</div>
```

### Toast
```js
toast('Saved successfully', 'success');  // success | error | warn | info
```

## Status

- [x] Tailwind config + design tokens
- [x] Component library (btn, card, input, badge, modal, tabs, toast)
- [x] Dark mode via `class="dark"` strategy
- [ ] Migrate `index.html` (homepage) — 80% done
- [ ] Migrate `product.html`
- [ ] Migrate `orders.html`, `payment.html`
- [ ] Migrate `admin.html`, `seller.html`, `settings.html`
- [ ] Migrate doc pages (`cara-order.html`, etc)
- [ ] Remove legacy `styles.css` (keep as fallback)

## Migration strategy

**Phase 1 (current):** Add `tw-components.css` + Tailwind CDN alongside existing `styles.css`. New elements use new classes.

**Phase 2:** Migrate pages one by one — replace inline styles + custom CSS classes with Tailwind utilities.

**Phase 3:** Remove `styles.css` once all pages migrated.

## Rollback

`tw-components.css` is independent of `styles.css`. To disable: remove the `<link>` from `<head>`.
