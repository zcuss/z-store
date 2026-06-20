// Affiliate program routes
export async function affiliateRoutes(app) {
  // Public endpoint — get user's ref code (or generate)
  app.get('/code', { preHandler: app.authenticate }, async (req) => {
    let code = await app.db('affiliate_codes').where({ user_id: req.user.id }).first();
    if (!code) {
      // Generate unique code from user id + name
      const base = (req.user.name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'user';
      const suffix = Math.random().toString(36).slice(2, 6);
      const candidate = base + suffix;
      try {
        await app.db('affiliate_codes').insert({ user_id: req.user.id, code: candidate });
        code = { user_id: req.user.id, code: candidate };
      } catch (e) {
        // duplicate, fetch again
        code = await app.db('affiliate_codes').where({ user_id: req.user.id }).first();
      }
    }
    // Compute stats
    const clicks = await app.db('affiliate_clicks').where({ user_id: req.user.id }).count('* as c').first();
    const referrals = await app.db('affiliate_referrals').where({ user_id: req.user.id }).count('* as c').first();
    const earnings = await app.db('affiliate_referrals')
      .where({ user_id: req.user.id, paid: true })
      .sum('commission as total')
      .first();
    return {
      code: code.code,
      link: `${process.env.BASE_URL || 'https://5.zcus.biz.id'}/shop/?ref=${code.code}`,
      clicks: Number(clicks?.c || 0),
      referrals: Number(referrals?.c || 0),
      earnings: Number(earnings?.total || 0),
    };
  });

  // Track click (public)
  app.post('/track-click', async (req) => {
    const { code, source } = req.body || {};
    if (!code) return { ok: false };
    const ref = await app.db('affiliate_codes').where({ code }).first();
    if (!ref) return { ok: false };
    await app.db('affiliate_clicks').insert({
      user_id: ref.user_id, code, source: source || 'direct',
    });
    return { ok: true };
  });

  // Stats
  app.get('/stats', { preHandler: app.authenticate }, async (req) => {
    const clicks = await app.db('affiliate_clicks').where({ user_id: req.user.id }).count('* as c').first();
    const referrals = await app.db('affiliate_referrals').where({ user_id: req.user.id }).count('* as c').first();
    const conversions = await app.db('affiliate_referrals').where({ user_id: req.user.id, status: 'converted' }).count('* as c').first();
    const earnings = await app.db('affiliate_referrals')
      .where({ user_id: req.user.id })
      .sum('commission as total')
      .first();
    return {
      clicks: Number(clicks?.c || 0),
      referrals: Number(referrals?.c || 0),
      conversions: Number(conversions?.c || 0),
      earnings: Number(earnings?.total || 0),
    };
  });

  // Leaderboard (public)
  app.get('/leaderboard', async () => {
    return app.db('affiliate_referrals')
      .join('users', 'affiliate_referrals.user_id', 'users.id')
      .groupBy('affiliate_referrals.user_id', 'users.name')
      .select('users.name', 'affiliate_referrals.user_id')
      .sum('affiliate_referrals.commission as earnings')
      .count('affiliate_referrals.id as referrals')
      .orderBy('earnings', 'desc')
      .limit(20);
  });
}
