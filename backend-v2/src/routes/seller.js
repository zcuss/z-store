// Seller dashboard routes
export async function sellerRoutes(app) {
  const requireSeller = { preHandler: [app.authenticate, app.requireRole('seller', 'admin', 'dev')] };

  // Dashboard stats
  app.get('/dashboard', requireSeller, async (req) => {
    const sellerId = req.user.id;
    const products = await app.db('products').where({ seller_id: sellerId }).count('* as c').first();
    const orders = await app.db('orders')
      .join('order_items', 'orders.id', 'order_items.order_id')
      .join('products', 'order_items.product_id', 'products.id')
      .where('products.seller_id', sellerId)
      .whereNot('orders.status', 'cancelled')
      .countDistinct('orders.id as c')
      .first();
    const balance = await app.db('seller_balances').where({ user_id: sellerId }).first();
    const escrowHolds = await app.db('escrow_holds')
      .join('orders', 'escrow_holds.order_id', 'orders.id')
      .join('order_items', 'orders.id', 'order_items.order_id')
      .join('products', 'order_items.product_id', 'products.id')
      .where('products.seller_id', sellerId)
      .where('escrow_holds.status', 'held')
      .sum('escrow_holds.amount as total')
      .first();
    const recentOrders = await app.db('orders')
      .join('order_items', 'orders.id', 'order_items.order_id')
      .join('products', 'order_items.product_id', 'products.id')
      .where('products.seller_id', sellerId)
      .select('orders.*')
      .orderBy('orders.created_at', 'desc')
      .limit(10)
      .distinct();
    return {
      products: Number(products?.c || 0),
      orders: Number(orders?.c || 0),
      balance: {
        available: Number(balance?.available || 0),
        pending: Number(balance?.pending || 0),
        total_earned: Number(balance?.total_earned || 0),
      },
      escrow_held: Number(escrowHolds?.total || 0),
      recent_orders: recentOrders,
    };
  });

  // List seller's products
  app.get('/products', requireSeller, async (req) => {
    return app.db('products')
      .where({ seller_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(100);
  });

  // List seller's orders (filtered by products they sell)
  app.get('/orders', requireSeller, async (req) => {
    return app.db('orders')
      .join('order_items', 'orders.id', 'order_items.order_id')
      .join('products', 'order_items.product_id', 'products.id')
      .where('products.seller_id', req.user.id)
      .select('orders.*')
      .distinct()
      .orderBy('orders.created_at', 'desc')
      .limit(100);
  });

  // Withdraw request
  app.post('/withdraw', requireSeller, async (req, reply) => {
    const { amount, method, account_info } = req.body || {};
    if (!amount || amount < 50000) return reply.code(400).send({ error: 'minimum_withdraw_50000' });
    if (!method) return reply.code(400).send({ error: 'method_required' });
    const balance = await app.db('seller_balances').where({ user_id: req.user.id }).first();
    if (!balance || Number(balance.available) < Number(amount)) {
      return reply.code(400).send({ error: 'insufficient_balance' });
    }
    const fee = Math.ceil(amount * 0.05);
    const net = amount - fee;
    const [id] = await app.db('withdrawals').insert({
      user_id: req.user.id,
      amount, fee, net_amount: net,
      method, account_info: account_info || null,
      status: 'pending',
    });
    // Deduct from available
    await app.db('seller_balances').where({ user_id: req.user.id }).decrement('available', amount);
    return { ok: true, id, fee, net_amount: net };
  });

  // List withdrawals
  app.get('/withdrawals', requireSeller, async (req) => {
    return app.db('withdrawals').where({ user_id: req.user.id }).orderBy('created_at', 'desc');
  });

  // Payout settings
  app.get('/payout-settings', requireSeller, async (req) => {
    return app.db('payout_settings').where({ user_id: req.user.id }).first() || {};
  });
  app.put('/payout-settings', requireSeller, async (req) => {
    const { bank_name, account_number, account_name } = req.body || {};
    const existing = await app.db('payout_settings').where({ user_id: req.user.id }).first();
    const data = {
      user_id: req.user.id,
      bank_name: bank_name || existing?.bank_name || null,
      account_number: account_number || existing?.account_number || null,
      account_name: account_name || existing?.account_name || null,
    };
    if (existing) {
      await app.db('payout_settings').where({ user_id: req.user.id }).update(data);
    } else {
      await app.db('payout_settings').insert(data);
    }
    return { ok: true };
  });

  // Transactions (release history)
  app.get('/transactions', requireSeller, async (req) => {
    return app.db('transactions')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(100);
  });
}
