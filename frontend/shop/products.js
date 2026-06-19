// Zcus Store — product catalog (20 items)
const PRODUCTS = [
  // FLASH SALE (8 items, disc > 30%)
  {id:1,  name:"Wireless Earbuds Pro X5 - Active Noise Cancelling",  price:399000,  old:899000,  disc:56, emoji:"🎧", cat:"Elektronik", sold:1240, rating:4.8, flash:true},
  {id:2,  name:"Mechanical Keyboard RGB 87 Keys - Hot Swappable",    price:599000,  old:1299000, disc:54, emoji:"⌨️", cat:"Elektronik", sold:892,  rating:4.7, flash:true},
  {id:3,  name:"Smart Watch Zcus Fit Pro - GPS + Heart Rate",        price:799000,  old:1799000, disc:56, emoji:"⌚", cat:"Elektronik", sold:654,  rating:4.9, flash:true},
  {id:4,  name:"USB-C Hub 8-in-1 HDMI 4K - Aluminum Body",          price:289000,  old:599000,  disc:52, emoji:"🔌", cat:"Elektronik", sold:2031, rating:4.6, flash:true},
  {id:5,  name:"Mouse Wireless Ergonomic Silent Click",             price:199000,  old:499000,  disc:60, emoji:"🖱️", cat:"Elektronik", sold:1567, rating:4.7, flash:true},
  {id:6,  name:"Standing Desk Electric 120cm - Memory Preset",      price:2499000, old:4999000, disc:50, emoji:"🪑", cat:"Elektronik", sold:234,  rating:4.8, flash:true},
  {id:7,  name:"Monitor 27\" 4K IPS HDR400 - 99% sRGB",            price:3999000, old:6999000, disc:43, emoji:"🖥️", cat:"Elektronik", sold:189,  rating:4.9, flash:true},
  {id:8,  name:"Webcam 4K Auto-Focus + Privacy Cover",              price:799000,  old:1499000, disc:47, emoji:"📷", cat:"Elektronik", sold:445,  rating:4.6, flash:true},

  // FEATURED (8 items)
  {id:9,  name:"Claude Pro Annual License - AI Assistant",          price:2400000, old:3000000, disc:20, emoji:"🤖", cat:"AI Tools",    sold:312, rating:4.9, featured:true},
  {id:10, name:"ChatGPT Plus 1 Year Subscription Voucher",          price:1850000, old:2400000, disc:23, emoji:"💬", cat:"AI Tools",    sold:534, rating:4.8, featured:true},
  {id:11, name:"Midjourney Standard Plan 1 Year",                   price:1750000, old:2200000, disc:20, emoji:"🎨", cat:"AI Tools",    sold:421, rating:4.7, featured:true},
  {id:12, name:"Zcus T-Shirt Black Logo - Premium Cotton 220gsm",   price:149000,  old:199000,  disc:25, emoji:"👕", cat:"Merchandise", sold:2890,rating:4.9, featured:true},
  {id:13, name:"Zcus Hoodie Zipper Navy - Limited Edition",         price:399000,  old:599000,  disc:33, emoji:"🧥", cat:"Merchandise", sold:876, rating:4.8, featured:true},
  {id:14, name:"Sticker Pack Zcus Vinyl 12pcs - Waterproof",        price:49000,   old:79000,   disc:38, emoji:"🎨", cat:"Merchandise", sold:3421,rating:4.7, featured:true},
  {id:15, name:"Mug Ceramic Zcus Logo 350ml - Microwave Safe",      price:79000,   old:119000,  disc:34, emoji:"☕", cat:"Merchandise", sold:1245,rating:4.8, featured:true},
  {id:16, name:"Template Web App Next.js Premium 50+ Pages",        price:299000,  old:599000,  disc:50, emoji:"📦", cat:"Digital Goods",sold:567, rating:4.9, featured:true},

  // NEW ARRIVAL (4 items)
  {id:17, name:"Hermes Agent Source Code - Lifetime License",       price:999000,  old:1499000, disc:33, emoji:"🤖", cat:"AI Tools",    sold:78,  rating:5.0, new:true},
  {id:18, name:"Voucher Hosting 1 Tahun + Domain Gratis",           price:399000,  old:599000,  disc:33, emoji:"🎟️", cat:"Voucher",     sold:234, rating:4.7, new:true},
  {id:19, name:"Jasa Setup VPS + Cloudflare Tunnel",                price:199000,  old:299000,  disc:33, emoji:"🛠️", cat:"Jasa",        sold:189, rating:4.9, new:true},
  {id:20, name:"Powerbank 20000mAh 65W PD Fast Charge",             price:499000,  old:799000,  disc:38, emoji:"🔋", cat:"Elektronik",  sold:678, rating:4.8, new:true},
];

const fmtIDR = n => 'Rp ' + n.toLocaleString('id-ID');
const disc = p => Math.round((1 - p.price / p.old) * 100);
