// Public utility routes — categories, promos, stats, newsletter
export async function publicRoutes(app) {
  // Categories (distinct from products table)
  app.get('/categories', async () => {
    return app.db('products')
      .where({ status: 'active' })
      .whereNotNull('category')
      .groupBy('category')
      .select('category')
      .count('* as count')
      .orderBy('count', 'desc');
  });

  // Active promo codes
  app.get('/promos', async () => {
    return app.db('promo_codes')
      .where({ active: true })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', app.db.fn.now());
      })
      .select('code', 'type', 'value', 'min_order', 'max_uses', 'used_count', 'expires_at', 'label');
  });

  // Live counters for homepage
  app.get('/stats/live', async () => {
    const users = await app.db('users').count('* as c').first();
    const orders = await app.db('orders').whereNot('status', 'cancelled').count('* as c').first();
    const products = await app.db('products').where({ status: 'active' }).count('* as c').first();
    return {
      users: Number(users?.c || 0),
      orders: Number(orders?.c || 0),
      products: Number(products?.c || 0),
      time: new Date().toISOString(),
    };
  });

  // Newsletter
  app.post('/newsletter/subscribe', async (req, reply) => {
    const { email, source = 'homepage' } = req.body || {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return reply.code(400).send({ error: 'invalid_email' });
    }
    const cleanEmail = email.toLowerCase().trim();
    try {
      await app.db('newsletter_subscribers').insert({ email: cleanEmail, source }).onConflict('email').ignore();
      return { ok: true };
    } catch (e) {
      return reply.code(500).send({ error: e.message });
    }
  });
}
