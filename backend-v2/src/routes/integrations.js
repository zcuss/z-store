// Integrations: Telegram bot, Discord bot, WhatsApp Business
export async function integrationRoutes(app) {
  const requireAuth = { preHandler: app.authenticate };

  // List my integrations
  app.get('/me', requireAuth, async (req) => {
    return app.db('platform_integrations').where({ owner_id: req.user.id });
  });

  // Connect Telegram bot (admin sets bot_token, regular users via widget)
  app.post('/telegram/bot', { preHandler: [app.authenticate, app.requireRole('admin', 'seller', 'dev')] }, async (req, reply) => {
    const { bot_token, bot_username } = req.body;
    if (!bot_token) return reply.code(400).send({ error: 'bot_token required' });
    // Verify token via getMe
    let me;
    try {
      const r = await fetch(`https://api.telegram.org/bot${bot_token}/getMe`);
      me = (await r.json()).result;
    } catch (e) { return reply.code(400).send({ error: 'invalid_bot_token', detail: e.message }); }
    if (!me || !me.id) return reply.code(400).send({ error: 'invalid_bot_token' });

    const existing = await app.db('platform_integrations').where({ owner_id: req.user.id, platform: 'telegram' }).first();
    const config = { bot_id: me.id, bot_username: me.username, bot_name: me.first_name };
    if (existing) {
      await app.db('platform_integrations').where({ id: existing.id }).update({
        enabled: true, status: 'connected', config: JSON.stringify(config),
        last_connected_at: app.db.fn.now(),
      });
    } else {
      await app.db('platform_integrations').insert({
        owner_id: req.user.id, platform: 'telegram', enabled: true, status: 'connected',
        config: JSON.stringify(config), last_connected_at: app.db.fn.now(),
      });
    }
    return { ok: true, bot: { id: me.id, username: me.username } };
  });

  // Connect Discord bot
  app.post('/discord/bot', { preHandler: [app.authenticate, app.requireRole('admin', 'seller', 'dev')] }, async (req, reply) => {
    const { bot_token } = req.body;
    if (!bot_token) return reply.code(400).send({ error: 'bot_token required' });
    let me;
    try {
      const r = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bot ${bot_token}` } });
      me = await r.json();
    } catch (e) { return reply.code(400).send({ error: 'invalid_bot_token' }); }
    if (!me.id) return reply.code(400).send({ error: 'invalid_bot_token' });

    const config = { bot_id: me.id, bot_username: me.username, bot_name: me.global_name || me.username };
    const existing = await app.db('platform_integrations').where({ owner_id: req.user.id, platform: 'discord' }).first();
    if (existing) {
      await app.db('platform_integrations').where({ id: existing.id }).update({
        enabled: true, status: 'connected', config: JSON.stringify(config), last_connected_at: app.db.fn.now(),
      });
    } else {
      await app.db('platform_integrations').insert({
        owner_id: req.user.id, platform: 'discord', enabled: true, status: 'connected',
        config: JSON.stringify(config), last_connected_at: app.db.fn.now(),
      });
    }
    return { ok: true, bot: { id: me.id, username: me.username } };
  });

  // Connect WhatsApp Business (saves phone_number_id + waba_id for sending catalog)
  app.post('/whatsapp/connect', { preHandler: app.authenticate }, async (req, reply) => {
    const { phone_number_id, whatsapp_business_id, access_token, catalog_id } = req.body;
    if (!phone_number_id || !access_token) return reply.code(400).send({ error: 'phone_number_id + access_token required' });
    const config = { phone_number_id, whatsapp_business_id, access_token, catalog_id };
    const existing = await app.db('platform_integrations').where({ owner_id: req.user.id, platform: 'whatsapp' }).first();
    if (existing) {
      await app.db('platform_integrations').where({ id: existing.id }).update({
        enabled: true, status: 'connected', config: JSON.stringify(config), last_connected_at: app.db.fn.now(),
      });
    } else {
      await app.db('platform_integrations').insert({
        owner_id: req.user.id, platform: 'whatsapp', enabled: true, status: 'connected',
        config: JSON.stringify(config), last_connected_at: app.db.fn.now(),
      });
    }
    return { ok: true };
  });

  // ===== Sync catalog to platform =====
  app.post('/sync/catalog/:platform', { preHandler: app.authenticate }, async (req, reply) => {
    const platform = req.params.platform;
    const integration = await app.db('platform_integrations').where({ owner_id: req.user.id, platform, enabled: true }).first();
    if (!integration) return reply.code(400).send({ error: 'integration_not_connected' });
    const cfg = JSON.parse(integration.config || '{}');
    const products = await app.db('products').where({ seller_id: req.user.id, status: 'active' });

    let sent = 0;
    if (platform === 'telegram') {
      const { bot_token } = cfg;
      for (const p of products) {
        const text = `🛍️ *${p.name}*\n\n💰 Rp ${Number(p.price).toLocaleString('id-ID')}\n📦 ${p.product_type || 'digital'}\n🛒 Order: https://5.zcus.biz.id/shop/product.html?slug=${p.slug}`;
        try {
          const buttons = { inline_keyboard: [[{ text: '🛒 Order', url: `https://5.zcus.biz.id/shop/product.html?slug=${p.slug}` }]] };
          await fetch(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: cfg.channel_chat_id || '@zstore_catalog', text, parse_mode: 'Markdown', reply_markup: buttons }),
          });
          sent++;
        } catch (e) { app.log.error('TG sync err:', e.message); }
      }
    } else if (platform === 'discord') {
      // Discord doesn't allow bot-initiated DMs without user opt-in
      // Use webhook URL if provided
      const { webhook_url } = cfg;
      if (!webhook_url) return reply.code(400).send({ error: 'webhook_url required for discord sync' });
      for (const p of products) {
        const embed = {
          title: p.name, description: (p.description || '').slice(0, 200),
          color: 5814783, fields: [{ name: 'Harga', value: `Rp ${Number(p.price).toLocaleString('id-ID')}` }],
          url: `https://5.zcus.biz.id/shop/product.html?slug=${p.slug}`,
        };
        try {
          await fetch(webhook_url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
          });
          sent++;
        } catch (e) { app.log.error('Discord sync err:', e.message); }
      }
    } else if (platform === 'whatsapp') {
      // WhatsApp Business Catalog sync — requires Meta API access
      const { access_token, catalog_id } = cfg;
      if (!catalog_id) return reply.code(400).send({ error: 'catalog_id required for whatsapp sync' });
      for (const p of products) {
        try {
          await fetch(`https://graph.facebook.com/v18.0/${catalog_id}/products`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: p.name, description: p.description, price: Math.round(p.price * 1000), currency: 'IDR',
              url: `https://5.zcus.biz.id/shop/product.html?slug=${p.slug}`, image_url: p.image_url,
            }),
          });
          sent++;
        } catch (e) { app.log.error('WA sync err:', e.message); }
      }
    }
    return { ok: true, sent, total: products.length };
  });

  // ===== Order notification broadcast (when order placed → ping linked platforms) =====
  app.post('/notify-order', { preHandler: app.authenticate }, async (req, reply) => {
    const { order_id } = req.body;
    const order = await app.db('orders').where({ id: order_id }).first();
    if (!order) return reply.code(404).send({ error: 'not_found' });

    const integrations = await app.db('platform_integrations').where({ owner_id: order.buyer_id, enabled: true });
    const notifs = [];
    for (const int of integrations) {
      const cfg = JSON.parse(int.config || '{}');
      if (int.platform === 'telegram' && cfg.bot_token) {
        const text = `✅ Order #${order.id} confirmed!\nTotal: Rp ${Number(order.total).toLocaleString('id-ID')}\nStatus: ${order.status}`;
        try {
          await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: order.buyer_id, text }),
          });
          notifs.push({ platform: 'telegram', ok: true });
        } catch (e) { notifs.push({ platform: 'telegram', ok: false, error: e.message }); }
      } else if (int.platform === 'discord' && cfg.webhook_url) {
        try {
          await fetch(cfg.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `✅ Order #${order.id} confirmed! Total: Rp ${Number(order.total).toLocaleString('id-ID')}` }) });
          notifs.push({ platform: 'discord', ok: true });
        } catch (e) { notifs.push({ platform: 'discord', ok: false, error: e.message }); }
      }
    }
    return { ok: true, notifications_sent: notifs };
  });
}
