// Products + categories + reviews + inventory
export async function productRoutes(app) {
  // List categories (public)
  app.get('/categories', async () => {
    const cats = await app.db('categories').orderBy('sort_order').select('*');
    return cats;
  });

  // List products (public, supports filtering)
  app.get('/', async (req) => {
    const { category, search, min, max, sort = 'newest', limit = 50, offset = 0 } = req.query;
    let q = app.db('products').where({ status: 'active' });
    if (category) q = q.where({ category });
    if (search) q = q.where('name', 'like', `%${search}%`);
    if (min) q = q.where('price', '>=', min);
    if (max) q = q.where('price', '<=', max);
    const orderMap = {
      newest: [['created_at', 'desc']],
      'price-asc': [['price', 'asc']], 'price-desc': [['price', 'desc']],
      sold: [['sold', 'desc']], rating: [['rating', 'desc']],
    };
    const rows = await q.orderBy(orderMap[sort] || orderMap.newest).limit(limit).offset(offset);
    return rows;
  });

  // Get product by ID
  app.get('/:id', async (req, reply) => {
    const id = parseInt(req.params.id);
    const p = await app.db('products').where({ id }).first();
    if (!p) return reply.code(404).send({ error: 'not_found' });
    p.reviews = await app.db('reviews').where({ product_id: id }).limit(10);
    return p;
  });

  // Get product by slug
  app.get('/slug/:slug', async (req, reply) => {
    const p = await app.db('products').where({ slug: req.params.slug }).first();
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return p;
  });

  // Reviews (public get, auth post)
  app.get('/:id/reviews', async (req) => {
    return app.db('reviews').where({ product_id: req.params.id }).orderBy('created_at', 'desc');
  });

  app.post('/:id/reviews', { preHandler: [app.authenticate, app.requireEmailVerified] }, async (req, reply) => {
    const { rating, text } = req.body;
    if (!rating || rating < 1 || rating > 5) return reply.code(400).send({ error: 'rating_1_to_5' });
    const id = await app.db('reviews').insert({ product_id: parseInt(req.params.id), user_id: req.user.id, rating, text: text || null });
    // Update product rating average
    const stats = await app.db('reviews').where({ product_id: req.params.id }).select(app.db.raw('AVG(rating) as avg, COUNT(*) as cnt')).first();
    await app.db('products').where({ id: parseInt(req.params.id) }).update({ rating: stats.avg || 0, review_count: stats.cnt });
    return { id, ok: true };
  });

  // ===== Seller endpoints =====
  app.post('/', { preHandler: [app.authenticate, app.requireEmailVerified, app.requireRole('seller', 'admin', 'dev')] }, async (req, reply) => {
    const { name, slug, category, description, price, original_price, stock, image_url, emoji, product_type, metadata } = req.body;
    if (!name || !price) return reply.code(400).send({ error: 'name + price required' });
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
    const [id] = await app.db('products').insert({
      seller_id: req.user.id, name, slug: finalSlug, category, description, price, original_price,
      stock: stock || 0, image_url, emoji, product_type: product_type || 'digital', metadata: metadata ? JSON.stringify(metadata) : null,
    });
    return { id, ok: true };
  });

  app.put('/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const id = parseInt(req.params.id);
    const existing = await app.db('products').where({ id }).first();
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.seller_id !== req.user.id && !['admin', 'dev'].includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const updates = req.body;
    delete updates.id; delete updates.seller_id; delete updates.created_at;
    if (updates.metadata) updates.metadata = JSON.stringify(updates.metadata);
    await app.db('products').where({ id }).update(updates);
    return { ok: true };
  });

  app.delete('/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const id = parseInt(req.params.id);
    const existing = await app.db('products').where({ id }).first();
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.seller_id !== req.user.id && !['admin', 'dev'].includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    await app.db('products').where({ id }).update({ status: 'archived' });
    return { ok: true };
  });

  // Inventory add
  app.post('/:id/inventory', { preHandler: [app.authenticate] }, async (req, reply) => {
    const id = parseInt(req.params.id);
    const existing = await app.db('products').where({ id }).first();
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    if (existing.seller_id !== req.user.id && !['admin', 'dev'].includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const items = req.body.items || [];
    let added = 0;
    for (const it of items) {
      await app.db('product_inventory').insert({ product_id: id, mail: it.mail, pass: it.pass, two_fa: it.two_fa, tutorial: it.tutorial });
      added++;
    }
    const stockCount = await app.db('product_inventory').where({ product_id: id, status: 'available' }).count('* as cnt').first();
    await app.db('products').where({ id }).update({ stock: stockCount.cnt });
    return { added, total_stock: stockCount.cnt };
  });
}
