// Zcus Store v3 — Glassmorphism + FontAwesome + Extra Features
// Top-level vars use `window.X` to coexist with other inline scripts on subpages
// (orders.html, settings.html, etc. each declare their own `let user/token`).
// Without this isolation, both `let user` declarations collide → SyntaxError
// halts entire app.js, breaking cart/wishlist/theme on every page.
// API base — always same-origin relative /api (works on localhost, 5.zcus.biz.id tunnel, zcus.biz.id cPanel, etc.)
// IMPORTANT: Do NOT declare `const API` or `var API` at top level here. Subpages (orders.html, settings.html, etc.)
// each declare their own `const API = ...` in inline <script> blocks. Re-declaring the same
// name in a separate classic script throws SyntaxError ("Identifier 'API' has already been declared"),
// which silently kills all event handlers in app.js (theme toggle, cart badge, loadProducts).
// Use window.API getter — set by subpage inline script first (correct path), or computed here as fallback.
if (typeof window !== 'undefined' && !window.API) {
  window.API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? location.origin + '/api'
    : '/api';
}
// Local alias for convenience (this DOES re-declare `const API` which would conflict, so use function)
const _api = () => window.API;
window.products = window.products || [];
window.cart = JSON.parse(localStorage.getItem('zcus_cart') || '[]');
window.wishlist = JSON.parse(localStorage.getItem('zcus_wishlist') || '[]');
window.recentlyViewed = JSON.parse(localStorage.getItem('zcus_recent') || '[]');
window.user = JSON.parse(localStorage.getItem('zcus_user') || 'null');
window.token = localStorage.getItem('zcus_token') || null;
window.currentFilter = { cat: '', search: '', sort: 'newest', min: '', max: '', promo: null };
window.currentView = 'grid';

// Mock reviews data (since DB doesn't have review system yet)
const MOCK_REVIEWS = {
  1: [
    {name: 'Andi P.', rating: 5, text: 'Akun Claude Pro langsung aktif, 2FA juga work. Recommended seller!', date: '2 hari lalu'},
    {name: 'Rina M.', rating: 5, text: 'Tutorialnya lengkap banget, gampang dipake. Thanks Zcus!', date: '5 hari lalu'},
    {name: 'Budi S.', rating: 4, text: 'Bagus, cuma agak lama aktivasi. Overall ok.', date: '1 minggu lalu'}
  ],
  2: [
    {name: 'Dewi K.', rating: 5, text: 'Voucher langsung kepake. Worth it!', date: '1 hari lalu'},
    {name: 'Fajar R.', rating: 5, text: 'Mantap, plus dapat bonus tutorial.', date: '3 hari lalu'}
  ],
  3: [
    {name: 'Sarah L.', rating: 5, text: 'Bahan adem, sablon rapih. Ukuran sesuai.', date: '4 hari lalu'},
    {name: 'Yoga P.', rating: 4, text: 'Bagus, pengiriman agak lama.', date: '1 minggu lalu'}
  ]
};

// Promo codes
const PROMOS = {
  'WELCOME50': { type: 'flat', value: 50000, label: 'WELCOME50 - Rp 50rb off' },
  'ZCUS10': { type: 'percent', value: 10, label: 'ZCUS10 - 10% off', min: 100000 },
  'HEMAT20': { type: 'percent', value: 20, label: 'HEMAT20 - 20% off', min: 500000 },
  'FLASH50': { type: 'percent', value: 50, label: 'FLASH50 - 50% off', min: 200000 }
};

// Category icon mapping
const CAT_ICONS = {
  'AI Tools': 'fa-robot',
  'Merchandise': 'fa-shirt',
  'Digital Goods': 'fa-floppy-disk',
  'Voucher': 'fa-ticket',
  'Jasa': 'fa-screwdriver-wrench',
  'Elektronik': 'fa-mobile-screen'
};

const fmtIDR = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const disc = p => p.original_price ? Math.round((1 - p.price / p.original_price) * 100) : 0;

// ============ INIT ============
// ============ MOBILE FILTER ============
function toggleMobileFilter() {
  const sheet = document.getElementById('mobileFilterSheet');
  sheet.classList.toggle('open');
  // Clone sidebar content on first open
  const content = document.getElementById('mobileFilterContent');
  if (!content.dataset.cloned && document.querySelector('.sidebar')) {
    content.innerHTML = document.querySelector('.sidebar').innerHTML;
    content.dataset.cloned = '1';
  }
}

function updateFilterCount() {
  const cat = currentFilter.cat;
  const promo = currentFilter.promo?.code;
  let count = 0;
  if (cat) count++;
  if (promo) count++;
  const fc = document.getElementById('filterCount');
  if (fc) {
    fc.textContent = count;
    fc.style.display = count ? 'flex' : 'none';
  }
}

// ============ MOBILE BOTTOM NAV ============
function setActiveNav(name) {
  document.querySelectorAll('.mbn-item').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === name);
  });
}

// Update filter count whenever filter changes
const _origFilterCat = filterCat;
filterCat = function(cat, btn) {
  _origFilterCat(cat, btn);
  updateFilterCount();
  // Close mobile filter sheet
  document.getElementById('mobileFilterSheet').classList.remove('open');
};
const _origApplyPromo = applyPromo;
applyPromo = function() {
  _origApplyPromo();
  updateFilterCount();
};

document.addEventListener('DOMContentLoaded', () => {
  // null-safe DOM lookups — pages may not have all elements
  const $ = id => { try { return document.getElementById(id); } catch (e) { return null; } };
  const $$ = sel => { try { return document.querySelector(sel); } catch (e) { return null; } };

  if (user && token) {
    const ai = $('accountIcon'); if (ai) ai.className = 'fa-solid fa-user-check';
    const sl = $('settingsLink'); if (sl) sl.style.display = 'flex';
    if (user.role === 'seller' || user.role === 'admin') {
      const sellerLink = $('sellerLink'); if (sellerLink) sellerLink.style.display = 'flex';
    }
    if (user.role === 'admin') {
      const al = $('adminLink'); if (al) al.style.display = 'flex';
    }
  }
  if ($$('.prod-grid, .products-grid, #prodGrid, #productsGrid, #productsList')) loadProducts();
  if ($('cartCount')) updateCartUI();
  if ($('wishCount')) updateWishlistUI();
  if ($('recentSection')) renderRecentlyViewed();
  if ($('recommendedSection')) renderRecommended();
  if ($('themeIcon')) initTheme();
  if ($('flashCountdown')) startFlashCountdown();
  if ($('notifBadge')) pollNotificationBadge();
});

async function pollNotificationBadge() {
  if (!token) return;
  try {
    const r = await fetch(_api() + '/notifications', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) {
      const d = await r.json();
      const unread = (d.notifications || []).filter(n => !n.read_at).length;
      const b = document.getElementById('notifBadge');
      if (b) { b.textContent = unread; b.style.display = unread > 0 ? 'flex' : 'none'; }
    }
  } catch (e) { /* dev */ }
  setTimeout(pollNotificationBadge, 30000);
}

function initTheme() {
  const saved = localStorage.getItem('zcus_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const ti = document.getElementById('themeIcon');
  if (ti) ti.className = saved === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('zcus_theme', next);
  const ti = document.getElementById('themeIcon');
  if (ti) ti.className = next === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  if (typeof toast === 'function') toast('Theme: ' + next, 'info');
}

function startFlashCountdown() {
  // Refresh every hour to align with announcement bar
  let end = new Date();
  end.setHours(end.getHours() + 2, end.getMinutes() + 45, 12);
  const update = () => {
    const remain = Math.max(0, end - new Date());
    const h = String(Math.floor(remain / 3600000)).padStart(2, '0');
    const m = String(Math.floor((remain % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
    const txt = `${h} : ${m} : ${s}`;
    const el = document.getElementById('flashCountdown');
    if (el) el.textContent = txt;
    // Flash sale section digits
    const elH = document.getElementById('flashH');
    const elM = document.getElementById('flashM');
    const elS = document.getElementById('flashS');
    if (elH) elH.textContent = h;
    if (elM) elM.textContent = m;
    if (elS) elS.textContent = s;
  };
  update();
  setInterval(update, 1000);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(_api() + path, { ...opts, headers: { ...headers, ...(opts.headers||{}) } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ============ PRODUCTS ============
async function loadProducts() {
  try {
    products = await api('/products');
    if (!Array.isArray(products) || !products.length) throw new Error('empty response');
    applyFilterLocal();
    updateCategoryCounts();
    updateStats();
  } catch (e) {
    console.warn('[loadProducts] API failed, using local PRODUCTS fallback:', e.message);
    // Local fallback: use PRODUCTS catalog from products.js (exposed as window.PRODUCTS) for static QA / dev
    const LOCAL_PRODUCTS = (typeof PRODUCTS !== 'undefined' && Array.isArray(PRODUCTS)) ? PRODUCTS
      : (window.PRODUCTS && Array.isArray(window.PRODUCTS) ? window.PRODUCTS : null);
    if (LOCAL_PRODUCTS && LOCAL_PRODUCTS.length) {
      window.products = LOCAL_PRODUCTS.map(p => ({
        id: p.id, name: p.name, price: p.price, original_price: p.old,
        category: p.cat, emoji: p.emoji, sold: p.sold || 0, rating: p.rating || 4.5,
        review_count: 0, review_avg: p.rating || 0,
        stock: 1 + (p.id % 30), created_at: new Date(Date.now() - p.id * 86400000).toISOString(),
        flash: !!p.flash, featured: !!p.featured, is_new: !!p.new, badge: ''
      }));
      applyFilterLocal();
      updateCategoryCounts();
      updateStats();
    } else {
      document.getElementById('prodGrid').innerHTML = `<div class="empty-state"><div class="empty-ico"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Gagal load</h3><p>${e.message}</p></div>`;
    }
  }
}

function updateCategoryCounts() {
  const counts = { all: products.length };
  products.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
  for (const k of ['all','AI Tools','Merchandise','Digital Goods','Voucher','Jasa','Elektronik']) {
    const el = document.getElementById('cnt-' + k);
    if (!el) continue;
    const cnt = counts[k] || 0;
    el.textContent = cnt;
    const btn = el.closest('.sb-cat');
    if (btn && cnt === 0 && k !== 'all') btn.style.display = 'none';
    else if (btn) btn.style.display = 'flex';
  }
}

function updateStats() {
  const totalSold = products.reduce((s, p) => s + (p.sold || 0), 0);
  const totalStock = products.reduce((s, p) => s + p.stock, 0);
  document.getElementById('statProducts').textContent = products.length || 0;
  document.getElementById('statSold').textContent = totalSold > 0 ? (totalSold > 1000 ? (totalSold/1000).toFixed(1)+'k' : totalSold) : 'Baru';
  document.getElementById('statBuyers').textContent = totalSold > 0 ? Math.floor(totalSold * 0.7).toString() : 'Baru';
}


function applyFilterLocal() {
  let filtered = [...products];
  if (currentFilter.cat) filtered = filtered.filter(p => p.category === currentFilter.cat);
  if (currentFilter.search) {
    const q = currentFilter.search.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }
  if (currentFilter.min) filtered = filtered.filter(p => p.price >= Number(currentFilter.min));
  if (currentFilter.max) filtered = filtered.filter(p => p.price <= Number(currentFilter.max));
  filtered = sortProducts(filtered, currentFilter.sort);
  renderProducts(filtered);
}

function sortProducts(arr, mode) {
  switch (mode) {
    case 'price-asc': return arr.sort((a,b) => a.price - b.price);
    case 'price-desc': return arr.sort((a,b) => b.price - a.price);
    case 'discount': return arr.sort((a,b) => disc(b) - disc(a));
    case 'sold': return arr.sort((a,b) => (b.sold||0) - (a.sold||0));
    case 'rating': return arr.sort((a,b) => (b.rating||0) - (a.rating||0));
    default: return arr.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

function getCatIcon(cat) { return CAT_ICONS[cat] || 'fa-box'; }

function renderProducts(items) {
  const grid = document.getElementById('prodGrid');
  document.getElementById('prodCount').textContent = items.length;
  document.getElementById('emptyState').style.display = items.length ? 'none' : 'block';
  if (!items.length) { grid.innerHTML = ''; return; }
  grid.className = 'prod-grid' + (currentView === 'list' ? ' list' : '');
  grid.innerHTML = items.map(p => productCard(p)).join('');
}

function productCard(p) {
  const d = disc(p);
  const isWished = wishlist.includes(p.id);
  const stockClass = p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : '';
  const stockText = p.stock === 0 ? 'Habis' : p.stock < 5 ? `Sisa ${p.stock}` : `Stok: ${p.stock}`;

  let badge = '';
  if (p.stock === 0) badge = '<span class="pc-badge soldout"><i class="fa-solid fa-ban"></i> Sold</span>';
  else if (d >= 50) badge = '<span class="pc-badge hot"><i class="fa-solid fa-fire"></i> HOT</span>';
  else if (d >= 30) badge = '<span class="pc-badge deal"><i class="fa-solid fa-bolt"></i> DEAL</span>';
  else if (p.sold > 10) badge = '<span class="pc-badge bestseller"><i class="fa-solid fa-crown"></i> BEST</span>';
  else if ((Date.now() - new Date(p.created_at)) < 7*24*60*60*1000) badge = '<span class="pc-badge new"><i class="fa-solid fa-sparkles"></i> NEW</span>';

  return `
  <div class="prod-card glass" onclick='viewProduct(${p.id})'>
    <div class="pc-img">
      <div class="pc-img-glow"></div>
      <div class="pc-badges">${badge}</div>
      <button class="pc-wish ${isWished?'active':''}" onclick="event.stopPropagation();toggleWish(${p.id})"><i class="fa-${isWished?'solid':'regular'} fa-heart"></i></button>
      ${d > 0 ? `<span class="pc-disc">-${d}%</span>` : ''}
      ${p.emoji
        ? `<div class="pc-ico" style="font-size:56px;line-height:1">${p.emoji}</div>`
        : `<i class="fa-solid ${getCatIcon(p.category)} pc-ico"></i>`}
    </div>
    <div class="pc-body">
      <div class="pc-cat">${p.category}</div>
      <div class="pc-name">${p.name}</div>
      <div class="pc-rating">
        ${p.review_count > 0
          ? `<i class="fa-solid fa-star star"></i><b>${p.review_avg}</b><span class="pc-rev-count">(${p.review_count})</span>`
          : (p.sold > 50 ? `<i class="fa-solid fa-fire star"></i><b>Hot</b>` : `<span class="pc-new-badge">NEW</span>`)}
        ${p.sold > 0 ? `<span class="pc-sold"><span class="dot">·</span> ${p.sold} sold</span>` : ''}
      </div>
      <div class="pc-price">${fmtIDR(p.price)}${p.original_price ? `<span class="pc-old">${fmtIDR(p.original_price)}</span>` : ''}</div>
      <div class="pc-stock ${stockClass}">
        <span class="stock-dot"></span> <i class="fa-solid ${p.stock < 5 ? 'fa-circle-exclamation' : 'fa-box'}"></i> ${stockText}
      </div>
    </div>
    <div class="pc-actions">
      <button class="pc-action-btn" onclick="event.stopPropagation();addToCart(${p.id})"><i class="fa-solid fa-cart-plus"></i> Cart</button>
      <button class="pc-action-btn" onclick="event.stopPropagation();toggleCompare(${p.id})" id="cmpBtn${p.id}"><i class="fa-solid fa-code-compare"></i> Compare</button>
      <button class="pc-action-btn primary" onclick="event.stopPropagation();viewProduct(${p.id})"><i class="fa-solid fa-bolt"></i> Beli</button>
    </div>
  </div>`;
}

function slugify(s) { return String(s||'').toLowerCase().replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,80); }

function viewProduct(id) {
  // Fetch product to get name for slug URL
  api('/products/' + id).then(p => {
    if (p && p.name) location.href = '/shop/product.html?slug=' + slugify(p.name);
    else location.href = '/shop/product.html?id=' + id;
  }).catch(() => location.href = '/shop/product.html?id=' + id);
}

async function showProduct(id) {
  try {
    const p = await api('/products/' + id);
    const d = disc(p);
    const isWished = wishlist.includes(p.id);
    addToRecentlyViewed(id);
    const reviews = MOCK_REVIEWS[id] || [];
    const avgRating = reviews.length ? (reviews.reduce((s,r) => s + r.rating, 0) / reviews.length).toFixed(1) : '0.0';

    document.getElementById('productDetail').innerHTML = `
      <div class="pd-grid">
        <div class="pd-img glass">
          <div class="pc-img-glow"></div>
          <i class="fa-solid ${getCatIcon(p.category)} pd-ico"></i>
        </div>
        <div class="pd-body">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;flex-wrap:wrap;gap:8px">
            <span class="pd-cat">${p.category}</span>
            <div style="display:flex;gap:6px">
              <button class="pc-wish ${isWished?'active':''}" onclick="toggleWish(${p.id});showProduct(${p.id})" style="position:relative;top:0;right:0"><i class="fa-${isWished?'solid':'regular'} fa-heart"></i> ${isWished ? 'Wishlisted' : 'Wishlist'}</button>
              <button class="pc-wish" onclick="shareProduct(${p.id})" style="position:relative;top:0;right:0"><i class="fa-solid fa-share-nodes"></i> Share</button>
            </div>
          </div>
          <h2>${p.name}</h2>
          <div class="pd-rating-row" onclick="showReviews(${p.id})" style="cursor:pointer">
            ${renderStars(avgRating)}
            <span style="color:var(--text-dim);font-size:13px;margin-left:8px">${avgRating} · ${reviews.length} reviews · <u>Lihat semua</u></span>
          </div>
          <p>${p.description || '—'}</p>
          <div class="pd-price">${fmtIDR(p.price)}${p.original_price ? `<span class="pc-old" style="font-size:16px;margin-left:8px">${fmtIDR(p.original_price)}</span><span style="background:rgba(239,68,68,.9);color:#fff;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;margin-left:8px">-${d}%</span>` : ''}</div>
          <div class="pd-meta glass">
            <div class="pd-meta-item"><span>STOK</span><b>${p.available || p.stock}</b></div>
            <div class="pd-meta-item"><span>SOLD</span><b>${p.sold || 0}</b></div>
            <div class="pd-meta-item"><span>RATING</span><b>★ ${avgRating}</b></div>
            <div class="pd-meta-item"><span>SELLER</span><b>${p.seller_name || 'Zcus'}</b></div>
          </div>
          <div class="pd-actions">
            <button class="btn btn-primary" style="flex:1" onclick='addToCart(${p.id});closeProduct()'><i class="fa-solid fa-cart-plus"></i> + Keranjang</button>
            <button class="btn btn-wa" onclick="window.open('https://wa.me/628xxxxxxxxxx?text=${encodeURIComponent('Halo, saya tertarik dengan ' + p.name)}')"><i class="fa-brands fa-whatsapp"></i> Tanya</button>
            <a class="btn btn-ghost" href="/shop/product.html?slug=${slugify(p.name)}" title="Halaman lengkap (SEO & share-friendly)"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          </div>
          <div class="pd-features glass">
            <h4><i class="fa-solid fa-check-double"></i> Yang Kamu Dapat</h4>
            <li><i class="fa-solid fa-check"></i> Instant delivery via email</li>
            <li><i class="fa-solid fa-check"></i> Akun original bergaransi 30 hari</li>
            <li><i class="fa-solid fa-check"></i> Tutorial setup lengkap (ID)</li>
            <li><i class="fa-solid fa-check"></i> CS 24/7 via WhatsApp</li>
            <li><i class="fa-solid fa-check"></i> Refund jika tidak sesuai</li>
          </div>
          <div class="pd-warning glass">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <div>
              <b>Penting!</b> Dilarang share detail akun. Segera ganti password setelah terima di email.
            </div>
          </div>
        </div>
      </div>
    `;
    showModal('product');
  } catch (e) { toast(e.message, 'error'); }
}

function renderStars(rating) {
  const r = parseFloat(rating) || 0;
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= r) html += '<i class="fa-solid fa-star star"></i>';
    else if (i - 0.5 <= r) html += '<i class="fa-solid fa-star-half-stroke star"></i>';
    else html += '<i class="fa-regular fa-star" style="color:var(--text-mute)"></i>';
  }
  return html;
}

function closeProduct() { hideModal('product'); }

// ============ REVIEWS ============
function showReviews(productId) {
  const reviews = MOCK_REVIEWS[productId] || [];
  const product = products.find(p => p.id === productId);
  const avg = reviews.length ? (reviews.reduce((s,r) => s + r.rating, 0) / reviews.length).toFixed(1) : '0.0';
  const counts = [5,4,3,2,1].map(s => reviews.filter(r => Math.round(r.rating) === s).length);

  document.getElementById('reviewsContent').innerHTML = `
    <h2><i class="fa-solid fa-star"></i> Reviews — ${product?.name || 'Product'}</h2>
    <div class="review-summary glass">
      <div class="review-avg">
        <div class="review-avg-num">${avg}</div>
        <div class="review-avg-stars">${renderStars(avg)}</div>
        <div class="review-avg-count">${reviews.length} reviews</div>
      </div>
      <div class="review-bars">
        ${[5,4,3,2,1].map((s,i) => `
          <div class="review-bar">
            <span class="rb-label">${s} <i class="fa-solid fa-star"></i></span>
            <div class="rb-track"><div class="rb-fill" style="width:${reviews.length ? (counts[i]/reviews.length*100) : 0}%"></div></div>
            <span class="rb-count">${counts[i]}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ${reviews.length ? `<div class="review-list">${reviews.map(r => `
      <div class="review-item glass">
        <div class="review-head">
          <div class="review-avatar">${r.name.charAt(0)}</div>
          <div>
            <b>${r.name}</b>
            <div class="review-meta">${renderStars(r.rating)} · <span>${r.date}</span></div>
          </div>
        </div>
        <p>${r.text}</p>
      </div>
    `).join('')}</div>` : '<p style="text-align:center;color:var(--text-mute);padding:40px">Belum ada review</p>'}
    ${user ? `<div class="review-form glass">
      <h4>Tulis Review</h4>
      <div class="review-stars-input" id="reviewStars">
        ${[1,2,3,4,5].map(i => `<i class="fa-regular fa-star" data-rating="${i}" onclick="setReviewRating(${i})"></i>`).join('')}
      </div>
      <textarea class="form-input" placeholder="Bagikan pengalaman kamu..." id="reviewText" rows="3"></textarea>
      <button class="btn btn-primary" onclick="submitReview(${productId})"><i class="fa-solid fa-paper-plane"></i> Submit Review</button>
    </div>` : '<p style="text-align:center;color:var(--text-dim);padding:20px"><a href="#" onclick="hideModal(\'reviews\');showModal(\'login\')">Login</a> untuk menulis review</p>'}
  `;
  showModal('reviews');
}

let reviewRating = 0;
function setReviewRating(r) {
  reviewRating = r;
  document.querySelectorAll('#reviewStars i').forEach((s, i) => {
    s.className = i < r ? 'fa-solid fa-star star' : 'fa-regular fa-star';
  });
}

function submitReview(productId) {
  const text = document.getElementById('reviewText')?.value.trim();
  if (!text || !reviewRating) return toast('Isi review + rating dulu', 'error');
  if (!MOCK_REVIEWS[productId]) MOCK_REVIEWS[productId] = [];
  MOCK_REVIEWS[productId].unshift({
    name: user?.name || 'Anonymous',
    rating: reviewRating,
    text,
    date: 'Baru saja'
  });
  toast('Review submitted!', 'success');
  reviewRating = 0;
  showReviews(productId);
}

// ============ SHARE ============
function shareProduct(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  const url = `${location.origin}/shop/?ref=share&p=${productId}`;
  const text = `Cek ${p.name} di Zcus Store — ${fmtIDR(p.price)} ${p.original_price ? `(diskon ${disc(p)}%)` : ''}`;
  document.getElementById('shareLink').value = url;
  document.getElementById('shareButtons').innerHTML = `
    <a class="share-btn whatsapp" target="_blank" href="https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}">
      <i class="fa-brands fa-whatsapp"></i> WhatsApp
    </a>
    <a class="share-btn telegram" target="_blank" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}">
      <i class="fa-brands fa-telegram"></i> Telegram
    </a>
    <a class="share-btn twitter" target="_blank" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}">
      <i class="fa-brands fa-twitter"></i> Twitter
    </a>
    <a class="share-btn facebook" target="_blank" href="https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">
      <i class="fa-brands fa-facebook"></i> Facebook
    </a>
  `;
  showModal('share');
}

function copyShareLink() {
  const link = document.getElementById('shareLink');
  link.select();
  navigator.clipboard.writeText(link.value).then(() => toast('Link copied!', 'success'));
}

// ============ RECENTLY VIEWED (server-side + local fallback) ============
let recentlyViewedData = [];

async function loadRecentlyViewed() {
  // Try server
  if (user && token) {
    try {
      const r = await fetch(_api() + '/users/me/recently-viewed', { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) {
        const d = await r.json();
        if (d.items && d.items.length) { recentlyViewedData = d.items; return renderRecentlyViewed(); }
      }
    } catch (e) { /* fallback */ }
  }
  // Local fallback from product list
  recentlyViewedData = recentlyViewed.map(id => products.find(p => p.id === id)).filter(Boolean);
  renderRecentlyViewed();
}

function addToRecentlyViewed(id) {
  if (recentlyViewed.includes(id)) recentlyViewed = recentlyViewed.filter(x => x !== id);
  recentlyViewed = [id, ...recentlyViewed].slice(0, 8);
  localStorage.setItem('zcus_recent', JSON.stringify(recentlyViewed));
  // Update data if loaded
  const p = products.find(x => x.id === id);
  if (p) {
    recentlyViewedData = [p, ...recentlyViewedData.filter(x => x.id !== id)].slice(0, 8);
    renderRecentlyViewed();
  }
}

async function clearRecentlyViewed() {
  if (user && token) {
    try { await fetch(_api() + '/users/me/recently-viewed', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }); } catch (e) {}
  }
  recentlyViewed = []; recentlyViewedData = [];
  localStorage.removeItem('zcus_recent');
  renderRecentlyViewed();
  toast('Recently viewed dihapus', 'info');
}

function renderRecentlyViewed() {
  if (!recentlyViewedData.length) { document.getElementById('recentSection').style.display = 'none'; return; }
  document.getElementById('recentSection').style.display = 'block';
  // Use better mini-card for recently viewed
  const fmtIDR2 = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  document.getElementById('recentGrid').innerHTML = recentlyViewedData.slice(0, 8).map(p => `
    <div class="rv-mini-card glass" onclick='viewProduct(${p.id})'>
      <div class="rv-mini-img"><i class="fa-solid ${getCatIcon(p.category)}"></i></div>
      <div class="rv-mini-info"><b>${p.name}</b><small>${fmtIDR2(p.price)}</small></div>
    </div>
  `).join('');
}

// ============ RECOMMENDED ============
function renderRecommended() {
  // Random 4 from same categories
  if (!products.length) return;
  const shuffled = [...products].sort(() => 0.5 - Math.random()).slice(0, 4);
  document.getElementById('recommendedSection').style.display = 'block';
  document.getElementById('recommendedGrid').innerHTML = shuffled.map(productCard).join('');
}

// ============ FILTER / SORT ============
function filterCat(cat, btn) {
  currentFilter.cat = cat;
  document.querySelectorAll('.sb-cat').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const titles = { '': 'Featured Products', 'AI Tools': 'AI Tools', 'Merchandise': 'Merchandise', 'Digital Goods': 'Digital Goods', 'Voucher': 'Voucher', 'Jasa': 'Jasa', 'Elektronik': 'Elektronik' };
  document.getElementById('prodTitle').textContent = titles[cat] || cat;
  document.getElementById('prodSub').textContent = cat ? `Showing all ${cat} products` : 'Showing all available products';
  applyFilterLocal();
  if (window.innerWidth < 900) document.getElementById('products').scrollIntoView({behavior:'smooth'});
}

function applySort() {
  currentFilter.sort = document.getElementById('sortSelect').value;
  applyFilterLocal();
}

function applyPrice() {
  currentFilter.min = document.getElementById('priceMin').value;
  currentFilter.max = document.getElementById('priceMax').value;
  applyFilterLocal();
}

function resetFilter() {
  currentFilter = { cat: '', search: '', sort: 'newest', min: '', max: '', promo: null };
  document.querySelectorAll('.sb-cat').forEach(b => b.classList.remove('active'));
  document.querySelector('.sb-cat').classList.add('active');
  document.getElementById('searchInput').value = '';
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  document.getElementById('sortSelect').value = 'newest';
  document.getElementById('promoInput').value = '';
  document.getElementById('promoMsg').textContent = '';
  document.getElementById('prodTitle').textContent = 'Featured Products';
  document.getElementById('prodSub').textContent = 'Showing all available products';
  applyFilterLocal();
  toast('Filter reset', 'info');
}

// ===== SEARCH V2 =====
let recentSearches = JSON.parse(localStorage.getItem('zcus_recent_searches') || '[]');
let trendingSearches = ['Claude Pro', 'Netflix Premium', 'ChatGPT Plus', 'Capcut Pro', 'Hosting cPanel', 'Voucher Spotify'];
let searchDebounce = null;

function searchProducts() {
  const q = document.getElementById('searchInput').value.trim();
  currentFilter.search = q;
  document.getElementById('searchClear').classList.toggle('show', !!q);
  clearTimeout(searchDebounce);
  if (q.length < 2) {
    showSearchSuggestions();
  } else {
    searchDebounce = setTimeout(() => runSearch(q), 200);
  }
  applyFilterLocal();
}

function showSearchSuggestions() {
  const dd = document.getElementById('searchDropdown');
  const recentHtml = recentSearches.length ? `
    <div class="sd-section">
      <div class="sd-section-title"><i class="fa-solid fa-clock-rotate-left"></i> Pencarian Terakhir <button onclick="clearRecentSearches(event)" class="sd-clear">Hapus</button></div>
      ${recentSearches.slice(0, 5).map(q => `<div class="sd-item sd-suggest" onclick="document.getElementById('searchInput').value='${q.replace(/'/g, "\\'")}';searchProducts()"><i class="fa-solid fa-clock-rotate-left"></i><div class="sd-name">${q}</div></div>`).join('')}
    </div>` : '';
  const trendingHtml = `
    <div class="sd-section">
      <div class="sd-section-title"><i class="fa-solid fa-arrow-trend-up"></i> Trending</div>
      ${trendingSearches.map(q => `<div class="sd-item sd-suggest" onclick="document.getElementById('searchInput').value='${q}';searchProducts()"><i class="fa-solid fa-magnifying-glass"></i><div class="sd-name">${q}</div></div>`).join('')}
    </div>`;
  const catsHtml = `
    <div class="sd-section">
      <div class="sd-section-title"><i class="fa-solid fa-layer-group"></i> Cari per Kategori</div>
      <div class="sd-cats">${['AI Tools','Voucher','Digital Goods','Merchandise','Software','Hosting','Game'].map(c => `<div class="sd-cat-chip" onclick="filterCat('${c}', document.querySelector('[data-cat=&quot;${c}&quot;]')); document.getElementById('searchInput').blur(); document.getElementById('searchDropdown').classList.remove('show')">${c}</div>`).join('')}</div>
    </div>`;
  dd.innerHTML = recentHtml + trendingHtml + catsHtml;
  dd.classList.add('show');
}

function runSearch(q) {
  const matches = products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(q.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8);
  const dd = document.getElementById('searchDropdown');
  if (matches.length) {
    dd.innerHTML = `<div class="sd-section"><div class="sd-section-title"><i class="fa-solid fa-magnifying-glass"></i> ${matches.length} hasil untuk "${q}"</div>${matches.map(p => `<div class="sd-item" onclick='saveSearch("${q}"); viewProduct(${p.id})'>
        <div class="sd-ico"><i class="fa-solid ${getCatIcon(p.category)}"></i></div>
        <div class="sd-info"><div class="sd-name">${highlightMatch(p.name, q)}</div><div class="sd-cat">${p.category}${p.review_count ? ` · ⭐ ${p.review_avg} (${p.review_count})` : ''}</div></div>
        <div class="sd-price">${fmtIDR(p.price)}</div>
      </div>`).join('')}</div>
      <div class="sd-section"><button class="sd-view-all" onclick='saveSearch("${q}"); currentFilter.search="${q.replace(/'/g, "\\'")}"; applyFilterLocal(); document.getElementById(\"searchDropdown\").classList.remove(\"show\")'><i class="fa-solid fa-th"></i> Lihat semua hasil di grid</button></div>`;
    dd.classList.add('show');
  } else {
    dd.innerHTML = `<div class="sd-empty">
      <i class="fa-solid fa-circle-xmark"></i>
      <div><b>Tidak ada hasil untuk "${q}"</b><small>Coba kata kunci lain atau jelajahi kategori di bawah</small></div>
      ${trendingSearches.slice(0, 3).map(q => `<button class="sd-cat-chip" onclick="document.getElementById('searchInput').value='${q}';runSearch('${q}')">${q}</button>`).join('')}
    </div>`;
    dd.classList.add('show');
  }
}

function highlightMatch(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return text.slice(0, i) + '<mark>' + text.slice(i, i + q.length) + '</mark>' + text.slice(i + q.length);
}

function saveSearch(q) {
  if (!q || q.length < 2) return;
  recentSearches = [q, ...recentSearches.filter(x => x !== q)].slice(0, 10);
  localStorage.setItem('zcus_recent_searches', JSON.stringify(recentSearches));
}

function clearRecentSearches(e) {
  e.stopPropagation();
  recentSearches = [];
  localStorage.removeItem('zcus_recent_searches');
  showSearchSuggestions();
  toast('Pencarian terakhir dihapus', 'info');
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  currentFilter.search = '';
  document.getElementById('searchClear').classList.remove('show');
  document.getElementById('searchDropdown').classList.remove('show');
  applyFilterLocal();
}

// Search input focus → show suggestions
document.addEventListener('focusin', e => {
  if (e.target.id === 'searchInput' && !e.target.value) showSearchSuggestions();
});
document.addEventListener('click', e => {
  if (!e.target.closest('.hdr-search') && !e.target.closest('#searchDropdown')) {
    document.getElementById('searchDropdown')?.classList.remove('show');
  }
});
// Enter key → save & navigate
document.addEventListener('keydown', e => {
  if (e.target.id === 'searchInput' && e.key === 'Enter') {
    saveSearch(e.target.value);
    currentFilter.search = e.target.value;
    applyFilterLocal();
    document.getElementById('searchDropdown').classList.remove('show');
  }
});

function setView(v) {
  currentView = v;
  document.getElementById('vtGrid').classList.toggle('active', v === 'grid');
  document.getElementById('vtList').classList.toggle('active', v === 'list');
  applyFilterLocal();
}

function applyPromo() {
  const code = (document.getElementById('promoInput').value || '').toUpperCase().trim();
  const msg = document.getElementById('promoMsg');
  if (!code) { msg.textContent = ''; msg.className = 'promo-msg'; currentFilter.promo = null; return; }
  const p = PROMOS[code];
  if (!p) { msg.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Kode tidak valid'; msg.className = 'promo-msg err'; currentFilter.promo = null; return; }
  currentFilter.promo = { code, ...p };
  msg.innerHTML = '<i class="fa-solid fa-circle-check"></i> ' + p.label;
  msg.className = 'promo-msg ok';
  toast('Promo applied: ' + p.label, 'success');
  updateCartUI();
}

function goHome() {
  resetFilter();
  window.scrollTo({top:0, behavior:'smooth'});
}

// ============ CART ============
function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p || p.stock === 0) return toast('Stok habis', 'error');
  const ex = cart.find(x => x.id === id);
  if (ex) ex.qty = Math.min(p.stock, ex.qty + 1);
  else cart.push({ ...p, qty: 1 });
  saveCart(); updateCartUI();
  toast('Ditambahkan ke keranjang', 'success');
}

function changeQty(id, d) {
  const ex = cart.find(x => x.id === id);
  if (!ex) return;
  ex.qty = Math.max(1, ex.qty + d);
  saveCart(); updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter(x => x.id !== id);
  saveCart(); updateCartUI();
  toast('Dihapus dari keranjang', 'info');
}

function saveCart() { localStorage.setItem('zcus_cart', JSON.stringify(cart)); }
function saveWishlist() { localStorage.setItem('zcus_wishlist', JSON.stringify(wishlist)); }

function calcPromoDiscount(subtotal) {
  if (!currentFilter.promo) return 0;
  const p = currentFilter.promo;
  if (p.min && subtotal < p.min) return 0;
  if (p.type === 'flat') return p.value;
  if (p.type === 'percent') return Math.floor(subtotal * p.value / 100);
  return 0;
}

function updateCartUI() {
  const count = cart.reduce((s, x) => s + x.qty, 0);
  const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const discount = calcPromoDiscount(subtotal);
  const total = Math.max(0, subtotal - discount);

  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartDrawerCount').textContent = count;
  // Mobile bottom-nav badge
  const mbn = document.getElementById('mbnCartBadge');
  if (mbn) { mbn.textContent = count; mbn.classList.toggle('show', count > 0); }
  const wbn = document.getElementById('mbnWishBadge');
  if (wbn) { const w = wishlist.length; wbn.textContent = w; wbn.classList.toggle('show', w > 0); }
  document.getElementById('cartSubtotal').textContent = fmtIDR(subtotal);
  document.getElementById('cartDiscount').textContent = '-' + fmtIDR(discount);
  document.getElementById('cartTotal').textContent = fmtIDR(total);
  document.getElementById('cartFoot').style.display = cart.length ? 'block' : 'none';
  document.getElementById('cartDiscountRow').style.display = discount > 0 ? 'flex' : 'none';
  document.getElementById('cartDiscountLabel').textContent = currentFilter.promo?.code || '-';

  const items = document.getElementById('cartItems');
  if (!cart.length) {
    items.innerHTML = `<div class="cd-empty"><div class="empty-ico"><i class="fa-solid fa-cart-arrow-down"></i></div><p>Keranjang kosong</p><button class="btn btn-ghost btn-sm" onclick="closeCart()">Mulai Belanja</button></div>`;
    return;
  }
  items.innerHTML = cart.map(x => `
    <div class="cd-item">
      <div class="cd-item-img"><i class="fa-solid ${getCatIcon(x.category)}"></i></div>
      <div class="cd-item-body">
        <div class="cd-item-name">${x.name}</div>
        <div class="cd-item-price">${fmtIDR(x.price)}</div>
        <div class="cd-qty">
          <button onclick="changeQty(${x.id},-1)">−</button>
          <span>${x.qty}</span>
          <button onclick="changeQty(${x.id},1)">+</button>
        </div>
        <button class="cd-remove" onclick="removeFromCart(${x.id})">Hapus</button>
      </div>
    </div>
  `).join('');
}

function openCart() {
  document.getElementById('cartDrawer').classList.add('open');
  if (user && !document.getElementById('buyerEmail').value) {
    document.getElementById('buyerEmail').value = user.email;
  }
}
function closeCart() { document.getElementById('cartDrawer').classList.remove('open'); }

// ============ WISHLIST ============
function toggleWish(id) {
  if (wishlist.includes(id)) {
    wishlist = wishlist.filter(x => x !== id);
    toast('Dihapus dari wishlist', 'info');
  } else {
    wishlist.push(id);
    toast('Ditambahkan ke wishlist', 'success');
  }
  saveWishlist();
  updateWishlistUI();
  renderRecentlyViewed();
  // Re-render current view
  const activeCat = document.querySelector('.sb-cat.active')?.dataset.cat;
  if (activeCat !== undefined) filterCat(activeCat, document.querySelector('.sb-cat.active'));
}

function updateWishlistUI() {
  const c = document.getElementById('wishCount');
  c.textContent = wishlist.length;
  c.style.display = wishlist.length ? 'flex' : 'none';
}

function showWishlist() {
  if (!user) { showModal('login'); return toast('Login dulu', 'error'); }
  const list = document.getElementById('wishlistList');
  if (!wishlist.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-ico"><i class="fa-solid fa-heart-crack"></i></div><h3>Wishlist kosong</h3><p>Save produk favorit kamu di sini</p></div>`;
  } else {
    const items = products.filter(p => wishlist.includes(p.id));
    list.innerHTML = `<div class="prod-grid">${items.map(productCard).join('')}</div>`;
  }
  showModal('wishlist');
}

// ============ CHECKOUT ============
async function checkout() {
  if (!user || !token) { showModal('auth'); return toast('Login dulu, Tuan', 'error'); }
  if (!cart.length) return toast('Keranjang kosong', 'error');
  const email = document.getElementById('buyerEmail').value.trim();
  if (!email || !email.includes('@')) return toast('Email wajib diisi', 'error');

  try {
    const res = await api('/orders/checkout', {
      method: 'POST',
      body: JSON.stringify({
        items: cart.map(x => ({ product_id: x.id, qty: x.qty })),
        buyer_email: email
      })
    });

    window.snap.pay(res.snap_token, {
      onSuccess: () => { toast('Pembayaran sukses! Cek email', 'success'); cart=[]; saveCart(); updateCartUI(); closeCart(); },
      onPending: () => { toast('Pembayaran pending', 'info'); },
      onError: () => { toast('Pembayaran gagal', 'error'); },
      onClose: () => { toast('Popup ditutup', 'info'); }
    });
  } catch (e) { toast('Checkout: ' + e.message, 'error'); }
}

// ============ AUTH ============
function showModal(name) {
  hideAllModals();
  const id = name === 'login' || name === 'register' ? 'auth' : name;
  const el = document.getElementById(id + 'Modal');
  if (!el) return console.error('modal not found:', id);
  el.classList.add('open');
  if (id === 'auth') showForm(name);
}
function hideModal(name) { document.getElementById(name + 'Modal').classList.remove('open'); }
function hideAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('open')); }
function showForm(name) {
  document.getElementById('loginForm').classList.toggle('active', name === 'login');
  document.getElementById('registerForm').classList.toggle('active', name === 'register');
  document.getElementById('authTitle').textContent = name === 'login' ? 'Login' : 'Daftar';
  document.getElementById('authSub').textContent = name === 'login' ? 'Masuk ke akun Zcus Store kamu' : 'Buat akun baru dalam hitungan detik';
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPass').value;
  if (!email || !password) return toast('Isi email + password', 'error');
  if (password.length < 6) return toast('Password min 6 karakter', 'error');
  try {
    const r = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    saveAuth(r.user, r.token);
    toast('Selamat datang, ' + r.user.name, 'success');
    hideModal('auth');
  } catch (e) { toast(e.message, 'error'); }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  if (!email || !password) return toast('Isi email + password', 'error');
  try {
    const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveAuth(r.user, r.token);
    toast('Selamat datang, ' + r.user.name, 'success');
    hideModal('auth');
  } catch (e) { toast(e.message, 'error'); }
}

async function doGoogle() {
  const email = prompt('Email Google Anda:');
  const name = prompt('Nama Anda:');
  if (!email) return;
  try {
    const google_id = 'google_' + btoa(email).slice(0, 20);
    const r = await api('/auth/google', { method: 'POST', body: JSON.stringify({ google_id, email, name }) });
    saveAuth(r.user, r.token);
    toast('Login Google berhasil!', 'success');
    hideModal('auth');
  } catch (e) { toast(e.message, 'error'); }
}

function saveAuth(u, t) {
  user = u; token = t;
  localStorage.setItem('zcus_user', JSON.stringify(u));
  localStorage.setItem('zcus_token', t);
  document.getElementById('accountIcon').className = 'fa-solid fa-user-check';
}

async function doLogout() {
  try { await fetch(_api() + '/auth/logout', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {} }); } catch (e) {}
  user = null; token = null;
  localStorage.removeItem('zcus_user');
  localStorage.removeItem('zcus_token');
  document.getElementById('accountIcon').className = 'fa-solid fa-user';
  hideModal('account');
  toast('Logout berhasil', 'info');
}

// ============ ORDERS ============
async function showOrders() {
  if (!user) { showModal('login'); return toast('Login dulu', 'error'); }
  showModal('orders');
  const list = document.getElementById('ordersList');
  list.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const orders = await api('/orders/me');
    if (!orders.length) { list.innerHTML = '<div class="empty-state"><div class="empty-ico"><i class="fa-solid fa-box-open"></i></div><h3>Belum ada pesanan</h3><p>Yuk checkout produk pertama kamu!</p></div>'; return; }
    list.innerHTML = orders.map(o => `
      <div class="order-card glass">
        <div class="oc-head">
          <span class="oc-id">#${o.id}</span>
          <span class="oc-status oc-${o.status}">${o.status}</span>
        </div>
        <div class="oc-body">${o.items || '—'}</div>
        <div class="oc-foot">
          <span><b style="color:var(--accent)">${fmtIDR(o.total)}</b></span>
          <span>${new Date(o.created_at).toLocaleString('id-ID')}</span>
        </div>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = '<div class="error">' + e.message + '</div>'; }
}

// ============ ACCOUNT ============
function showAccount() {
  if (!user) return showModal('login');
  document.getElementById('accountContent').innerHTML = `
    <div class="auth-head">
      <div class="brand-mark big">${user.name?.charAt(0).toUpperCase() || 'Z'}</div>
      <h2>${user.name}</h2>
      <p>${user.email}</p>
    </div>
    <div class="acc-info glass">
      <p><span>User ID</span> <b>#${user.id}</b></p>
      <p><span>Role</span> <b style="text-transform:capitalize">${user.role}</b></p>
      <p><span>Member Since</span> <b>${new Date().toLocaleDateString('id-ID')}</b></p>
    </div>
    <button class="btn btn-primary full" onclick="hideModal('account');showOrders()"><i class="fa-solid fa-box"></i> Pesanan Saya</button>
    <button class="btn btn-ghost full" style="margin-top:8px" onclick="hideModal('account');showWishlist()"><i class="fa-solid fa-heart"></i> Wishlist (${wishlist.length})</button>
    <button class="btn btn-ghost full" style="margin-top:8px" onclick="hideModal('account')"><i class="fa-solid fa-gear"></i> Settings</button>
    <button class="btn btn-ghost full" style="margin-top:8px" onclick="doLogout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
  `;
  showModal('account');
}

// ============ TOAST ============
let toastTimer;
function toast(msg, type='info') {
  const t = document.getElementById('toast');
  t.className = 'toast toast-' + type + ' show';
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';
  t.innerHTML = `<i class="fa-solid ${icon}"></i> ${msg}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
