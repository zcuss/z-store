// User profile endpoints
export async function userRoutes(app) {
  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const u = await app.db('users').where({ id: req.user.id }).first();
    if (!u) return { user: null };
    // SECURITY: Never expose password_hash, totp_secret, or other sensitive fields
    return {
      user: {
        id: u.id, email: u.email, name: u.name, role: u.role,
        admin_subrole: u.admin_subrole,
        email_verified: !!u.email_verified, avatar_url: u.avatar_url,
        phone: u.phone, bio: u.bio,
        created_at: u.created_at,
        linked: {
          google: !!u.google_id, telegram: !!u.telegram_id, discord: !!u.discord_id, whatsapp: !!u.whatsapp_number,
          telegram_id: u.telegram_id, discord_id: u.discord_id, whatsapp_number: u.whatsapp_number,
        },
        totp_enabled: !!u.totp_enabled, // status only, NOT the secret
      }
    };
  });

  app.put('/me', { preHandler: app.authenticate }, async (req) => {
    const updates = req.body;
    delete updates.id; delete updates.email; delete updates.role; delete updates.email_verified;
    delete updates.password_hash; delete updates.totp_secret; delete updates.totp_enabled;
    await app.db('users').where({ id: req.user.id }).update(updates);
    const u = await app.db('users').where({ id: req.user.id }).first();
    return { ok: true, user: { id: u.id, email: u.email, name: u.name, role: u.role, avatar_url: u.avatar_url } };
  });

  app.get('/me/notifications', { preHandler: app.authenticate }, async (req) => {
    return app.db('notifications').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(50);
  });

  // Recently viewed products (server-side tracking)
  app.get('/me/recently-viewed', { preHandler: app.authenticate }, async (req) => {
    const views = await app.db('product_views')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(20);
    // Join product details
    const productIds = [...new Set(views.map(v => v.product_id))];
    if (!productIds.length) return { products: [] };
    const products = await app.db('products')
      .whereIn('id', productIds)
      .select('id', 'name', 'slug', 'price', 'emoji', 'image_url', 'category');
    // Preserve order
    const productMap = new Map(products.map(p => [p.id, p]));
    return {
      products: productIds.map(id => productMap.get(id)).filter(Boolean)
    };
  });

  app.delete('/me/recently-viewed', { preHandler: app.authenticate }, async (req) => {
    await app.db('product_views').where({ user_id: req.user.id }).del();
    return { ok: true };
  });
}
