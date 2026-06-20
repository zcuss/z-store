// Orders — checkout, list, detail, confirm-delivery, invoice
import crypto from 'node:crypto';

export async function orderRoutes(app) {
  // List my orders
  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    return app.db('orders').where({ buyer_id: req.user.id }).orderBy('created_at', 'desc');
  });

  // Get order detail
  app.get('/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const id = parseInt(req.params.id);
    const order = await app.db('orders').where({ id }).first();
    if (!order) return reply.code(404).send({ error: 'not_found' });
    if (order.buyer_id !== req.user.id && !['admin', 'dev'].includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    order.items = await app.db('order_items').where({ order_id: id });
    for (const it of order.items) {
      it.delivery_data = await app.db('deliveries').where({ order_id: id, product_id: it.product_id }).first();
    }
    return order;
  });

  // Checkout (creates order + Midtrans Snap token)
  app.post('/checkout', { preHandler: [app.authenticate, app.requireEmailVerified] }, async (req, reply) => {
    const { items, promo_code, address } = req.body;
    if (!Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'items_required' });
    let subtotal = 0;
    const lineItems = [];
    for (const it of items) {
      const p = await app.db('products').where({ id: it.product_id, status: 'active' }).first();
      if (!p) return reply.code(404).send({ error: 'product_not_found', product_id: it.product_id });
      const line = { product_id: p.id, qty: it.qty || 1, price: p.price };
      subtotal += p.price * line.qty;
      lineItems.push(line);
    }
    // Discount
    let discount = 0;
    if (promo_code) {
      const promo = await app.db('promo_codes').where({ code: promo_code, active: true }).first();
      if (promo && (!promo.expires_at || new Date(promo.expires_at) > new Date()) && (!promo.max_uses || promo.used_count < promo.max_uses) && subtotal >= promo.min_order) {
        discount = promo.type === 'percent' ? Math.floor(subtotal * promo.value / 100) : promo.value;
        await app.db('promo_codes').where({ id: promo.id }).increment('used_count', 1);
      }
    }
    const total = subtotal - discount;
    const midtransOrderId = `ZS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const [orderId] = await app.db('orders').insert({
      buyer_id: req.user.id, midtrans_order_id: midtransOrderId, status: 'pending',
      subtotal, discount, platform_fee: 0, payment_fee: 0, total, promo_code: promo_code || null,
    });
    for (const li of lineItems) await app.db('order_items').insert({ order_id: orderId, ...li });

    // Midtrans Snap token (sandbox key ok)
    let snapToken = null;
    let redirectUrl = null;
    try {
      const midtrans = await import('midtrans-client').then(m => m.default).catch(() => null);
      if (midtrans) {
        const snap = new midtrans.Snap({
          isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
          serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-XXXX',
          clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-XXXX',
        });
        const trx = await snap.createTransaction({
          transaction_details: { order_id: midtransOrderId, gross_amount: total },
          customer_details: { email: req.user.email, first_name: req.user.name },
          item_details: lineItems.map(li => ({ id: li.product_id, price: li.price, quantity: li.qty, name: `Product #${li.product_id}` })),
        });
        snapToken = trx.token;
        redirectUrl = trx.redirect_url;
      }
    } catch (e) { app.log.warn('Midtrans Snap failed (sandbox):', e.message); }

    return { order_id: orderId, midtrans_order_id: midtransOrderId, midtrans_token: snapToken, midtrans_redirect_url: redirectUrl, total };
  });

  // Confirm delivery (buyer ack → escrow release)
  app.post('/:id/confirm-delivery', { preHandler: app.authenticate }, async (req, reply) => {
    const id = parseInt(req.params.id);
    const order = await app.db('orders').where({ id }).first();
    if (!order) return reply.code(404).send({ error: 'not_found' });
    if (order.buyer_id !== req.user.id) return reply.code(403).send({ error: 'forbidden' });
    if (order.status !== 'paid') return reply.code(400).send({ error: 'not_paid' });
    await app.db('orders').where({ id }).update({ status: 'completed', confirmed_at: app.db.fn.now() });
    // Release escrow
    await app.db('escrow_holds').where({ order_id: id, status: 'held' }).update({ status: 'released', released_at: app.db.fn.now() });
    return { ok: true, status: 'completed' };
  });

  // Invoice (HTML or PDF)
  app.get('/:id/invoice', { preHandler: app.authenticate }, async (req, reply) => {
    const id = parseInt(req.params.id);
    const order = await app.db('orders').where({ id }).first();
    if (!order) return reply.code(404).send({ error: 'not_found' });
    if (order.buyer_id !== req.user.id && !['admin', 'dev'].includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    reply.type('text/html').send(`<!doctype html><h1>Invoice #${id}</h1><pre>${JSON.stringify(order, null, 2)}</pre>`);
  });
}
