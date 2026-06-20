// Track order (public — by midtrans_order_id or numeric id, with email or token)
export async function trackRoutes(app) {
  // Public track by order id (no auth needed for guest track)
  app.get('/:orderId', async (req, reply) => {
    const idOrCode = req.params.orderId;
    let order;
    if (/^\d+$/.test(idOrCode)) {
      order = await app.db('orders').where({ id: parseInt(idOrCode) }).first();
    } else {
      order = await app.db('orders').where({ midtrans_order_id: idOrCode }).first();
    }
    if (!order) return reply.code(404).send({ error: 'not_found' });
    // Build timeline
    const timeline = [
      { step: 'pending', label: 'Order Dibuat', at: order.created_at, done: true },
      { step: 'paid', label: 'Pembayaran Diterima', at: order.paid_at, done: !!order.paid_at },
      { step: 'processing', label: 'Diproses', at: order.paid_at, done: !!order.paid_at },
      { step: 'delivered', label: 'Dikirim ke Email', at: order.confirmed_at, done: !!order.confirmed_at },
      { step: 'completed', label: 'Selesai', at: order.confirmed_at, done: order.status === 'completed' },
    ];
    // Items (without revealing credentials)
    const items = await app.db('order_items')
      .where({ order_id: order.id })
      .leftJoin('products', 'order_items.product_id', 'products.id')
      .select('order_items.product_id', 'order_items.qty', 'order_items.price',
              'products.name', 'products.emoji', 'products.category');
    return {
      order: {
        id: order.id,
        midtrans_order_id: order.midtrans_order_id,
        status: order.status,
        total: order.total,
        subtotal: order.subtotal,
        discount: order.discount,
        promo_code: order.promo_code,
        payment_type: order.payment_type,
        timeline,
        items,
        created_at: order.created_at,
        paid_at: order.paid_at,
        confirmed_at: order.confirmed_at,
      }
    };
  });
}
