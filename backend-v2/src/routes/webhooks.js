// Webhooks: Midtrans payment notification + Telegram/Discord/WhatsApp bot callbacks
import crypto from 'node:crypto';

export async function webhookRoutes(app) {

  // Midtrans payment notification
  app.post('/midtrans', async (req, reply) => {
    const notif = req.body;
    try {
      const midtrans = await import('midtrans-client').then(m => m.default).catch(() => null);
      let statusResponse = notif;
      if (midtrans) {
        const snap = new midtrans.Snap({
          isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
          serverKey: process.env.MIDTRANS_SERVER_KEY || '',
          clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
        });
        statusResponse = await snap.transaction.notification(notif);
      }
      const orderId = statusResponse.order_id;
      const txStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;

      if (txStatus === 'capture' || (txStatus === 'settlement' && (!fraudStatus || fraudStatus === 'accept'))) {
        // Atomic update with WHERE clause (idempotent)
        const updated = await app.db('orders').where({ midtrans_order_id: orderId, status: 'pending' }).update({
          status: 'paid', paid_at: app.db.fn.now(), payment_type: statusResponse.payment_type,
        });
        if (updated > 0) {
          const order = await app.db('orders').where({ midtrans_order_id: orderId }).first();
          if (order) {
            // Reserve inventory + log transaction + escrow
            const items = await app.db('order_items').where({ order_id: order.id });
            for (const it of items) {
              for (let i = 0; i < it.qty; i++) {
                const inv = await app.db('product_inventory').where({ product_id: it.product_id, status: 'available' }).orderBy('id').limit(1).first();
                if (inv) await app.db('product_inventory').where({ id: inv.id }).update({ status: 'reserved', order_id: order.id, reserved_at: app.db.fn.now() });
              }
            }
            await app.db('products').where('id', 'in', items.map(i => i.product_id)).increment('sold', app.db.raw('(SELECT SUM(qty) FROM order_items WHERE order_id = ?)', [order.id]));
            // Escrow per seller
            const sellers = await app.db.raw(`
              SELECT oi.product_id, oi.qty, oi.price, p.seller_id
              FROM order_items oi JOIN products p ON oi.product_id = p.id
              WHERE oi.order_id = ?`, [order.id]);
            for (const row of sellers) {
              const sellerAmount = row.price * row.qty * 0.95; // 5% platform fee
              const releaseAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
              await app.db('escrow_holds').insert({
                order_id: order.id, seller_id: row.seller_id,
                amount: row.price * row.qty, seller_amount: sellerAmount,
                platform_fee: row.price * row.qty * 0.05, payment_fee: 0,
                status: 'held', release_at: releaseAt,
              });
              // Upsert seller_balances — portable across MySQL/Postgres/Cockroach/SQLite
              await app.db('seller_balances')
                .insert({ user_id: row.seller_id, pending: sellerAmount, total_earned: sellerAmount, available: 0 })
                .onConflict('user_id')
                .merge({ pending: app.db.raw('pending + ?', [sellerAmount]), total_earned: app.db.raw('total_earned + ?', [sellerAmount]) });
              await app.db('transactions').insert({
                user_id: row.seller_id, type: 'sale', amount: sellerAmount,
                reference_type: 'order', reference_id: order.id, description: `Order #${order.id}`,
              });
            }
            // Deliver credentials via all linked platforms
            for (const it of items) {
              const inv = await app.db('product_inventory').where({ order_id: order.id, product_id: it.product_id, status: 'reserved' }).first();
              if (inv) {
                const deliveryText = `🎉 Order #${order.id} - ${it.product_id}\n\n📧 Email: ${inv.mail || '-'}\n🔑 Password: ${inv.pass || '-'}\n${inv.two_fa ? `🔐 2FA: ${inv.two_fa}\n` : ''}${inv.tutorial ? `\n📖 Tutorial: ${inv.tutorial}` : ''}`;
                await app.db('deliveries').insert({ order_id: order.id, product_id: it.product_id, channel: 'email', recipient: order.buyer_id, message: deliveryText, status: 'sent', sent_at: app.db.fn.now() });
                // Send via email
                try {
                  await app.mailer.sendMail({
                    from: `"Z Store" <${process.env.GMAIL_USER || 'noreply@zcussxyz'}>`,
                    to: order.buyer_id, subject: `Order #${order.id} - Produk Digital`,
                    html: `<pre>${deliveryText}</pre>`,
                  });
                } catch (e) { app.log.error('delivery email:', e.message); }
                // Send via linked platforms
                const ints = await app.db('platform_integrations').where({ owner_id: order.buyer_id, enabled: true });
                for (const int of ints) {
                  const cfg = JSON.parse(int.config || '{}');
                  if (int.platform === 'whatsapp' && cfg.access_token && cfg.phone_number_id) {
                    try {
                      await fetch(`https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${cfg.access_token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ messaging_product: 'whatsapp', to: cfg.recipient_phone, type: 'text', text: { body: deliveryText } }),
                      });
                      await app.db('deliveries').insert({ order_id: order.id, product_id: it.product_id, channel: 'whatsapp', recipient: cfg.recipient_phone, message: deliveryText, status: 'sent', sent_at: app.db.fn.now() });
                    } catch (e) { app.log.error('WA delivery:', e.message); }
                  } else if (int.platform === 'telegram' && cfg.bot_token) {
                    try {
                      await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: order.buyer_id, text: deliveryText }),
                      });
                      await app.db('deliveries').insert({ order_id: order.id, product_id: it.product_id, channel: 'telegram', recipient: order.buyer_id, message: deliveryText, status: 'sent', sent_at: app.db.fn.now() });
                    } catch (e) { app.log.error('TG delivery:', e.message); }
                  }
                }
              }
            }
          }
        }
      } else if (txStatus === 'cancel' || txStatus === 'deny' || txStatus === 'expire') {
        await app.db('orders').where({ midtrans_order_id: orderId }).update({ status: 'cancelled' });
      }
      return { ok: true };
    } catch (e) {
      app.log.error('Midtrans webhook:', e);
      return reply.code(500).send({ error: 'webhook_failed' });
    }
  });

  // Telegram bot callback (when user clicks inline button, etc)
  app.post('/telegram', async (req, reply) => {
    const update = req.body;
    app.log.info({ update }, 'TG update');
    // Bot commands: /start, /catalog, /order ID
    // Inline button data: "buy:<slug>" or "track:<order_id>"
    // For simplicity, just acknowledge — full bot handling via separate process
    return { ok: true };
  });

  // Discord interactions
  app.post('/discord', async (req, reply) => {
    const interaction = req.body;
    app.log.info({ interaction }, 'Discord interaction');
    // Discord requires PONG response for type=1 (ping)
    if (interaction.type === 1) return { type: 1 };
    // Handle button clicks via custom_id
    if (interaction.type === 3 && interaction.data?.custom_id?.startsWith('buy:')) {
      return { type: 4, data: { content: `Buka https://5.zcus.biz.id/shop/product.html?slug=${interaction.data.custom_id.slice(4)}` } };
    }
    return { type: 4, data: { content: 'Command not recognized' } };
  });

  // WhatsApp webhook (message delivery status, inbound messages)
  app.post('/whatsapp', async (req, reply) => {
    const body = req.body;
    app.log.info({ body }, 'WA webhook');
    // Verify webhook signature (Meta)
    // For now, just accept and log
    return { ok: true };
  });
}
