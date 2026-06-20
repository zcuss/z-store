// Seed data for local dev — products, promos, dev user
import { db } from './index.js';

const dbi = db();
const now = dbi.fn.now();

async function seed() {
  // 1. Create a dev user (full access)
  let devUser = await dbi('users').where({ email: 'dev@zcuss.xyz' }).first();
  if (!devUser) {
    const [id] = await dbi('users').insert({
      email: 'dev@zcuss.xyz',
      name: 'Z Store Dev',
      role: 'dev',
      email_verified: true,
    });
    devUser = { id };
    console.log(`✓ Created dev user id=${id}`);
  } else {
    console.log(`Dev user id=${devUser.id} already exists`);
  }

  // 2. Create a seller user
  let seller = await dbi('users').where({ email: 'seller@zcuss.xyz' }).first();
  if (!seller) {
    const [id] = await dbi('users').insert({
      email: 'seller@zcuss.xyz',
      name: 'Z Store Official',
      role: 'seller',
      email_verified: true,
      avatar_url: 'https://ui-avatars.com/api/?name=Z+Store&background=0ea5e9&color=fff&size=128',
    });
    seller = { id };
    console.log(`✓ Created seller id=${id}`);
  } else {
    console.log(`Seller id=${seller.id} already exists`);
  }

  // 3. Seed products
  const products = [
    { name: 'Claude Pro — 1 Bulan', category: 'ai', price: 250000, original_price: 350000, emoji: '🤖', product_type: 'digital', featured: true, stock: 50 },
    { name: 'ChatGPT Plus — 1 Bulan', category: 'ai', price: 280000, original_price: 380000, emoji: '💬', product_type: 'digital', featured: true, stock: 30 },
    { name: 'Midjourney Pro — 1 Bulan', category: 'ai', price: 320000, original_price: 420000, emoji: '🎨', product_type: 'digital', featured: true, flash: true, stock: 20 },
    { name: 'Gemini Advanced — 1 Bulan', category: 'ai', price: 230000, emoji: '✨', product_type: 'digital', stock: 25 },
    { name: 'Perplexity Pro — 1 Bulan', category: 'ai', price: 195000, emoji: '🔍', product_type: 'digital', stock: 40 },
    { name: 'Hosting 1GB — 1 Tahun', category: 'hosting', price: 150000, original_price: 250000, emoji: '🌐', product_type: 'voucher', stock: 100 },
    { name: 'Domain .my.id — 1 Tahun', category: 'hosting', price: 25000, emoji: '🔗', product_type: 'voucher', stock: 200 },
    { name: 'Voucher Google Play Rp 100rb', category: 'voucher', price: 105000, emoji: '🎁', product_type: 'voucher', stock: 50 },
    { name: 'Voucher Steam Rp 60rb', category: 'voucher', price: 65000, emoji: '🎮', product_type: 'voucher', stock: 75 },
    { name: 'Spotify Premium — 3 Bulan', category: 'subscription', price: 90000, original_price: 120000, emoji: '🎵', product_type: 'digital', stock: 30 },
    { name: 'Netflix Premium — 1 Bulan', category: 'subscription', price: 180000, emoji: '📺', product_type: 'digital', stock: 20 },
    { name: 'YouTube Premium — 1 Bulan', category: 'subscription', price: 60000, emoji: '▶️', product_type: 'digital', stock: 40 },
    { name: 'Canva Pro — 1 Bulan', category: 'design', price: 75000, emoji: '🖼️', product_type: 'digital', stock: 60 },
    { name: 'Figma Pro — 1 Bulan', category: 'design', price: 120000, emoji: '🎨', product_type: 'digital', stock: 35 },
    { name: 'Notion AI — 1 Bulan', category: 'productivity', price: 110000, emoji: '📝', product_type: 'digital', stock: 25 },
  ];

  const existing = await dbi('products').count('* as c').first();
  if (Number(existing.c) === 0) {
    for (const p of products) {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '').slice(0, 200);
      const desc = `${p.name} — produk digital premium Z Store. Instant delivery via email. Garansi 30 hari. Bayar via Midtrans (QRIS/VA/E-Wallet).`;
      await dbi('products').insert({
        seller_id: seller.id,
        name: p.name,
        slug,
        category: p.category,
        description: desc,
        price: p.price,
        original_price: p.original_price || null,
        stock: p.stock,
        emoji: p.emoji,
        product_type: p.product_type,
        featured: !!p.featured,
        flash: !!p.flash,
        status: 'active',
        rating: (4.5 + Math.random() * 0.5).toFixed(2),
        review_count: Math.floor(Math.random() * 200) + 10,
        sold: Math.floor(Math.random() * 500),
        metadata: JSON.stringify({ provider: 'official' }),
        created_at: now,
        updated_at: now,
      });
    }
    console.log(`✓ Seeded ${products.length} products`);
  } else {
    console.log(`Products table already has ${existing.c} rows, skipping seed`);
  }

  // 4. Seed inventory items (so orders have something to deliver)
  const productsList = await dbi('products').select('id', 'name');
  let invCount = 0;
  for (const p of productsList) {
    const existing = await dbi('product_inventory').where({ product_id: p.id }).count('* as c').first();
    if (Number(existing.c) < 3) {
      for (let i = 0; i < 5; i++) {
        await dbi('product_inventory').insert({
          product_id: p.id,
          mail: `acc${i + 1}@${p.name.toLowerCase().split(' ')[0]}.test`,
          pass: `Pass${Math.random().toString(36).slice(2, 8)}!`,
          two_fa: i % 2 === 0 ? null : `JBSWY3DPEHPK3PXP`,
          tutorial: `Login via web. Email & password sudah terisi. Jangan ganti password. Hubungi CS jika ada masalah.`,
          status: 'available',
        });
        invCount++;
      }
    }
  }
  console.log(`✓ Seeded ${invCount} inventory items`);

  // 5. Seed promos
  const promoCount = await dbi('promo_codes').count('* as c').first();
  if (Number(promoCount.c) === 0) {
    await dbi('promo_codes').insert([
      { code: 'WELCOME10', type: 'percent', value: 10, min_order: 50000, max_uses: 1000, used_count: 0, active: true, label: 'Diskon 10% untuk member baru' },
      { code: 'HEMAT50K', type: 'flat', value: 50000, min_order: 300000, max_uses: 500, used_count: 0, active: true, label: 'Potongan Rp 50rb min order 300rb' },
      { code: 'ZSTORE20', type: 'percent', value: 20, min_order: 200000, max_uses: 200, used_count: 0, active: true, label: 'Promo weekend 20% off' },
    ]);
    console.log('✓ Seeded 3 promo codes');
  } else {
    console.log('Promo codes already exist, skipping');
  }

  // 6. Seed categories (legacy table)
  const catCount = await dbi('categories').count('* as c').first();
  if (Number(catCount.c) === 0) {
    await dbi('categories').insert([
      { slug: 'ai', name: 'AI Tools', icon: '🤖', sort_order: 1 },
      { slug: 'subscription', name: 'Subscription', icon: '⭐', sort_order: 2 },
      { slug: 'hosting', name: 'Hosting & Domain', icon: '🌐', sort_order: 3 },
      { slug: 'voucher', name: 'Voucher', icon: '🎁', sort_order: 4 },
      { slug: 'design', name: 'Design Tools', icon: '🎨', sort_order: 5 },
      { slug: 'productivity', name: 'Productivity', icon: '📝', sort_order: 6 },
    ]);
    console.log('✓ Seeded 6 categories');
  }

  console.log('\n✅ Seed complete');
  console.log('Test users:');
  console.log('  - dev@zcuss.xyz (role: dev) — full access');
  console.log('  - seller@zcuss.xyz (role: seller)');
  console.log('  - test@zcuss.xyz (role: buyer, registered earlier)');
  process.exit(0);
}

seed().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
