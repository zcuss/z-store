// Support / helpdesk ticket routes
export async function supportRoutes(app) {
  const requireAuth = { preHandler: app.authenticate };

  // List my tickets
  app.get('/tickets', requireAuth, async (req) => {
    return app.db('support_tickets')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc');
  });

  // Get one ticket with messages
  app.get('/tickets/:id', requireAuth, async (req, reply) => {
    const id = parseInt(req.params.id);
    const ticket = await app.db('support_tickets').where({ id, user_id: req.user.id }).first();
    if (!ticket) return reply.code(404).send({ error: 'not_found' });
    const messages = await app.db('support_messages').where({ ticket_id: id }).orderBy('created_at', 'asc');
    return { ...ticket, messages };
  });

  // Create ticket
  app.post('/tickets', requireAuth, async (req, reply) => {
    const { subject, message, priority } = req.body || {};
    if (!subject || !message) return reply.code(400).send({ error: 'subject_and_message_required' });
    const [id] = await app.db('support_tickets').insert({
      user_id: req.user.id,
      subject, status: 'open',
      priority: priority || 'normal',
    });
    await app.db('support_messages').insert({
      ticket_id: id, user_id: req.user.id,
      message, from: 'user',
    });
    return { ok: true, id };
  });

  // Reply to ticket
  app.post('/tickets/:id/reply', requireAuth, async (req, reply) => {
    const id = parseInt(req.params.id);
    const { message } = req.body || {};
    if (!message) return reply.code(400).send({ error: 'message_required' });
    const ticket = await app.db('support_tickets').where({ id, user_id: req.user.id }).first();
    if (!ticket) return reply.code(404).send({ error: 'not_found' });
    await app.db('support_messages').insert({
      ticket_id: id, user_id: req.user.id,
      message, from: 'user',
    });
    await app.db('support_tickets').where({ id }).update({ status: 'open', updated_at: app.db.fn.now() });
    return { ok: true };
  });
}
