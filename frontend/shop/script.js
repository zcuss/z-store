const _lsJSON = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { try { localStorage.removeItem(k); } catch (_) {} return fb; } };
const _lsStr = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
// Zcus Store -- main script
let cart = _lsJSON('zcus_cart', '[]');

// ---- Render product cards ----
function productCard(p) {
  const d = disc(p);
  return `
  <div class="prod-card" onclick='addToCart(${p.id})'>
    <div class="pc-img">
      ${d >= 30 ? `<span class="pc-disc">-${d}%</span>` : ''}
      ${p.flash ? `<span class="pc-badge">⚡ FLASH</span>` : ''}
      <span>${p.emoji}</span>
    </div>
    <div class="pc-body">
      <div class="pc-name">${p.name}</div>
      <div class="pc-price">${fmtIDR(p.price)}<span class="pc-old">${fmtIDR(p.old)}</span></div>
      <div class="pc-meta">
        <span class="pc-rating">★ ${p.rating}</span>
        <span class="pc-sold">${p.sold > 1000 ? (p.sold/1000).toFixed(1)+'rb' : p.sold} terjual</span>
      </div>
    </div>
  </div>`;
}

function renderProducts() {
  const flash = document.getElementById('flash-products');
  if (flash) flash.innerHTML = PRODUCTS.filter(p => p.flash).map(productCard).join('');

  const featured = document.getElementById('featured-products');
  if (featured) featured.innerHTML = PRODUCTS.filter(p => p.featured).map(productCard).join('');

  const newest = document.getElementById('new-products');
  if (newest) newest.innerHTML = PRODUCTS.filter(p => p.new).map(productCard).join('');
}

// ---- Cart ----
function saveCart() { localStorage.setItem('zcus_cart', JSON.stringify(cart)); }

function addToCart(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const ex = cart.find(x => x.id === id);
  if (ex) ex.qty += 1; else cart.push({...p, qty: 1});
  saveCart();
  updateCartUI();
  toggleCart(true);
  flashFAB();
}

function changeQty(id, delta) {
  const ex = cart.find(x => x.id === id);
  if (!ex) return;
  ex.qty = Math.max(1, ex.qty + delta);
  saveCart();
  updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter(x => x.id !== id);
  saveCart();
  updateCartUI();
}

function updateCartUI() {
  const count = cart.reduce((s, x) => s + x.qty, 0);
  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);

  document.getElementById('cart-count').textContent = count;
  document.getElementById('fab-count').textContent = count;
  document.getElementById('cart-total').textContent = fmtIDR(total);

  const items = document.getElementById('cart-items');
  if (!items) return;
  if (cart.length === 0) {
    items.innerHTML = '<div class="cd-empty">Keranjang kosong. Yuk belanja!</div>';
    return;
  }
  items.innerHTML = cart.map(x => `
    <div class="cd-item">
      <div class="cd-item-img">${x.emoji}</div>
      <div class="cd-item-body">
        <div class="cd-item-name">${x.name}</div>
        <div class="cd-item-price">${fmtIDR(x.price)}</div>
        <div class="cd-qty">
          <button onclick="changeQty(${x.id},-1)">−</button>
          <span>${x.qty}</span>
          <button onclick="changeQty(${x.id},1)">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleCart(open) {
  const drawer = document.getElementById('cart-drawer');
  if (open === true) drawer.classList.add('open');
  else if (open === false) drawer.classList.remove('open');
  else drawer.classList.toggle('open');
}

function flashFAB() {
  const fab = document.querySelector('.fab-cart');
  fab.style.transform = 'scale(1.2)';
  setTimeout(() => fab.style.transform = 'scale(1)', 200);
}

// ---- Countdown ----
function startCountdown(duration) {
  const end = Date.now() + duration;
  const update = () => {
    const remain = Math.max(0, end - Date.now());
    const h = String(Math.floor(remain / 3600000)).padStart(2, '0');
    const m = String(Math.floor((remain % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
    const txt = `${h} : ${m} : ${s}`;
    document.querySelectorAll('#countdown, #cd2').forEach(el => el.textContent = txt);
    if (remain > 0) requestAnimationFrame(update);
  };
  update();
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  updateCartUI();
  startCountdown(2 * 3600000 + 45 * 60000 + 12000);
});
