// Notifications routes
export async function notificationRoutes(app) {
  const requireAuth = { preHandler: app.authenticate };

  // List my notifications
  app.get('/', requireAuth, async (req) => {
    return app.db('notifications')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(50);
  });

  // Mark one as read
  app.post('/:id/read', requireAuth, async (req) => {
    const id = parseInt(req.params.id);
    await app.db('notifications')
      .where({ id, user_id: req.user.id })
      .update({ read_at: app.db.fn.now() });
    return { ok: true };
  });

  // Mark all as read
  app.post('/read-all', requireAuth, async (req) => {
    await app.db('notifications')
      .where({ user_id: req.user.id })
      .update({ read_at: app.db.fn.now() });
    return { ok: true };
  });
}
