// Admin + dev endpoints
export async function adminRoutes(app) {
  const requireAdmin = { preHandler: [app.authenticate, app.requireRole('admin', 'dev')] };
  const requireDev = { preHandler: [app.authenticate, app.requireRole('dev')] };

  // Dashboard stats
  app.get('/stats', requireAdmin, async () => {
    const [users] = await app.db.raw('SELECT COUNT(*) as c FROM users');
    const [orders] = await app.db.raw("SELECT COUNT(*) as c, SUM(total) as rev FROM orders WHERE status IN ('paid','completed')");
    const [products] = await app.db.raw("SELECT COUNT(*) as c FROM products WHERE status='active'");
    return { users: users.c, orders: orders.c, revenue: orders.rev || 0, products: products.c };
  });

  // List all users
  app.get('/users', requireAdmin, async (req) => {
    const { role, q, limit = 50, offset = 0 } = req.query;
    let query = app.db('users');
    if (role) query = query.where({ role });
    if (q) query = query.where('name', 'like', `%${q}%`).orWhere('email', 'like', `%${q}%`);
    return query.orderBy('created_at', 'desc').limit(limit).offset(offset);
  });

  // Update user role
  app.put('/users/:id/role', requireAdmin, async (req, reply) => {
    const id = parseInt(req.params.id);
    const { role, admin_subrole } = req.body;
    if (!['buyer', 'seller', 'admin', 'dev'].includes(role)) return reply.code(400).send({ error: 'invalid_role' });
    if (admin_subrole && !['cs', 'marketing', 'tech', 'service'].includes(admin_subrole)) {
      return reply.code(400).send({ error: 'invalid_admin_subrole' });
    }
    await app.db('users').where({ id }).update({ role, admin_subrole: admin_subrole || null });
    return { ok: true };
  });

  // List all orders
  app.get('/orders', requireAdmin, async (req) => {
    const { status, limit = 50, offset = 0 } = req.query;
    let q = app.db('orders');
    if (status) q = q.where({ status });
    return q.orderBy('created_at', 'desc').limit(limit).offset(offset);
  });

  // Withdrawals
  app.get('/withdrawals', requireAdmin, async () => app.db('withdrawals').orderBy('created_at', 'desc'));

  app.post('/withdrawals/:id/approve', requireAdmin, async (req, reply) => {
    const id = parseInt(req.params.id);
    const w = await app.db('withdrawals').where({ id }).first();
    if (!w) return reply.code(404).send({ error: 'not_found' });
    if (w.status !== 'pending') return reply.code(400).send({ error: 'not_pending' });
    await app.db('withdrawals').where({ id }).update({ status: 'completed', processed_at: app.db.fn.now() });
    await app.db('seller_balances').where({ user_id: w.user_id }).decrement('available', w.net_amount);
    return { ok: true };
  });

  app.post('/withdrawals/:id/reject', requireAdmin, async (req, reply) => {
    const id = parseInt(req.params.id);
    const { reason } = req.body;
    const w = await app.db('withdrawals').where({ id }).first();
    if (!w) return reply.code(404).send({ error: 'not_found' });
    await app.db('withdrawals').where({ id }).update({ status: 'rejected', processed_at: app.db.fn.now(), notes: reason || 'rejected' });
    await app.db('seller_balances').where({ user_id: w.user_id }).increment('available', w.net_amount);
    return { ok: true };
  });
}
