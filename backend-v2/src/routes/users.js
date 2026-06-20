// User profile endpoints
export async function userRoutes(app) {
  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const u = await app.db('users').where({ id: req.user.id }).first();
    return { user: u };
  });

  app.put('/me', { preHandler: app.authenticate }, async (req) => {
    const updates = req.body;
    delete updates.id; delete updates.email; delete updates.role; delete updates.email_verified;
    await app.db('users').where({ id: req.user.id }).update(updates);
    const u = await app.db('users').where({ id: req.user.id }).first();
    return { ok: true, user: u };
  });

  app.get('/me/notifications', { preHandler: app.authenticate }, async (req) => {
    return app.db('notifications').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(50);
  });
}
