// Z Store v2 — product catalog fallback (15 items, matches backend seed)
// Used as fallback when /api/products fails (e.g. static-only dev).
// Source of truth is the backend — keep in sync with backend-v2/src/db/seed.js
;(function(){
const PRODUCTS = [
  {id:1,  name:"Claude Pro — 1 Bulan",          price:250000, old:350000, disc:29, emoji:"🤖", cat:"ai",          sold:181, rating:4.83, featured:true},
  {id:2,  name:"ChatGPT Plus — 1 Bulan",         price:280000, old:380000, disc:26, emoji:"💬", cat:"ai",          sold:111, rating:4.80, featured:true},
  {id:3,  name:"Midjourney Pro — 1 Bulan",        price:320000, old:420000, disc:24, emoji:"🎨", cat:"ai",          sold:270, rating:4.85, featured:true, flash:true},
  {id:4,  name:"Gemini Advanced — 1 Bulan",       price:230000, old:null,   disc:0,  emoji:"✨", cat:"ai",          sold:111, rating:4.75},
  {id:5,  name:"Perplexity Pro — 1 Bulan",        price:195000, old:null,   disc:0,  emoji:"🔍", cat:"ai",          sold:300, rating:4.70},
  {id:6,  name:"Hosting 1GB — 1 Tahun",           price:150000, old:250000, disc:40, emoji:"🌐", cat:"hosting",     sold:242, rating:4.65},
  {id:7,  name:"Domain .my.id — 1 Tahun",         price:25000,  old:null,   disc:0,  emoji:"🔗", cat:"hosting",     sold:89,  rating:4.60},
  {id:8,  name:"Voucher Google Play Rp 100rb",    price:105000, old:null,   disc:0,  emoji:"🎁", cat:"voucher",     sold:155, rating:4.80},
  {id:9,  name:"Voucher Steam Rp 60rb",           price:65000,  old:null,   disc:0,  emoji:"🎮", cat:"voucher",     sold:201, rating:4.70},
  {id:10, name:"Spotify Premium — 3 Bulan",       price:90000,  old:120000, disc:25, emoji:"🎵", cat:"subscription",sold:78,  rating:4.75},
  {id:11, name:"Netflix Premium — 1 Bulan",       price:180000, old:null,   disc:0,  emoji:"📺", cat:"subscription",sold:92,  rating:4.60},
  {id:12, name:"YouTube Premium — 1 Bulan",       price:60000,  old:null,   disc:0,  emoji:"▶️", cat:"subscription",sold:312, rating:4.85},
  {id:13, name:"Canva Pro — 1 Bulan",             price:75000,  old:null,   disc:0,  emoji:"🖼️", cat:"design",      sold:189, rating:4.80},
  {id:14, name:"Figma Pro — 1 Bulan",             price:120000, old:null,   disc:0,  emoji:"🎨", cat:"design",      sold:67,  rating:4.75},
  {id:15, name:"Notion AI — 1 Bulan",             price:110000, old:null,   disc:0,  emoji:"📝", cat:"productivity",sold:54,  rating:4.85}
];
const fmtIDR = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const disc = p => p.old ? Math.round((1 - p.price / p.old) * 100) : 0;
window.PRODUCTS = PRODUCTS;
window.PRODUCTS_fmtIDR = fmtIDR;
window.PRODUCTS_disc = disc;
})();
