// Portable schema migrations via Knex (works with all supported DBs)
// Run: node src/db/migrate.js

import { db } from './index.js';

const SCHEMA = [
  // v8 — base
  {
    name: '001_initial_users',
    up: async (db) => {
      // Skip if already exists (idempotent)
      if (await db.schema.hasTable('users')) {
        console.log('  (users table already exists, skipping)');
        return;
      }
      await db.schema.createTable('users', (t) => {
        t.increments('id').primary();
        t.string('email', 190).nullable().unique();
        t.string('password_hash', 255).nullable();
        t.string('google_id', 255).nullable().unique();
        t.string('telegram_id', 50).nullable().unique();
        t.string('telegram_username', 100).nullable();
        t.string('discord_id', 50).nullable().unique();
        t.string('whatsapp_number', 30).nullable().unique();
        t.string('phone', 30).nullable();
        t.string('name', 100);
        t.string('avatar_url', 500).nullable();
        t.text('bio').nullable();
        t.enu('role', ['buyer', 'seller', 'admin', 'dev']).defaultTo('buyer');
        t.enu('admin_subrole', ['cs', 'marketing', 'tech', 'service']).nullable();
        t.boolean('email_verified').defaultTo(false);
        t.string('totp_secret', 255).nullable();
        t.boolean('totp_enabled').defaultTo(false);
        t.timestamp('email_verified_at').nullable();
        t.timestamp('last_login_at').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.timestamp('updated_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('magic_links', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
        t.string('token', 128).unique();
        t.string('purpose', 50); // login | reset | verify
        t.timestamp('expires_at');
        t.timestamp('used_at').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('otp_codes', (t) => {
        t.increments('id').primary();
        t.string('target', 255); // email or phone
        t.string('code', 10);
        t.string('purpose', 50);
        t.string('channel', 20); // email | whatsapp | telegram
        t.timestamp('expires_at');
        t.timestamp('used_at').nullable();
        t.integer('attempts').defaultTo(0);
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('user_sessions', (t) => {
        t.string('jti', 64).primary();
        t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
        t.json('payload').nullable();
        t.timestamp('expires_at');
        t.timestamp('revoked_at').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('platform_integrations', (t) => {
        t.increments('id').primary();
        t.integer('owner_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
        t.enu('platform', ['telegram', 'discord', 'whatsapp']);
        t.boolean('enabled').defaultTo(true);
        t.string('status', 30).defaultTo('connected');
        t.json('config').nullable();
        t.timestamp('last_connected_at').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.unique(['owner_id', 'platform']);
      });
      await db.schema.createTable('categories', (t) => {
        t.increments('id').primary();
        t.string('slug', 80).unique();
        t.string('name', 100);
        t.string('icon', 50).nullable();
        t.integer('sort_order').defaultTo(0);
      });
      await db.schema.createTable('products', (t) => {
        t.increments('id').primary();
        t.integer('seller_id').unsigned().references('id').inTable('users');
        t.string('name', 200);
        t.string('slug', 200).unique();
        t.string('category', 80).nullable();
        t.text('description').nullable();
        t.decimal('price', 12, 2);
        t.decimal('original_price', 12, 2).nullable();
        t.integer('stock').defaultTo(0);
        t.string('image_url', 500).nullable();
        t.string('emoji', 20).nullable();
        t.string('product_type', 30).defaultTo('digital'); // digital | joki | source_code | api_key | voucher
        t.decimal('rating', 3, 2).defaultTo(0);
        t.integer('review_count').defaultTo(0);
        t.integer('sold').defaultTo(0);
        t.boolean('featured').defaultTo(false);
        t.boolean('flash').defaultTo(false);
        t.enu('status', ['active', 'archived', 'draft']).defaultTo('active');
        t.json('metadata').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.timestamp('updated_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('product_inventory', (t) => {
        t.increments('id').primary();
        t.integer('product_id').unsigned().references('id').inTable('products').onDelete('CASCADE');
        t.text('mail').nullable();
        t.text('pass').nullable();
        t.text('two_fa').nullable();
        t.text('tutorial').nullable();
        t.enu('status', ['available', 'reserved', 'sold']).defaultTo('available');
        t.integer('order_id').unsigned().nullable();
        t.timestamp('reserved_at').nullable();
      });
      await db.schema.createTable('orders', (t) => {
        t.increments('id').primary();
        t.integer('buyer_id').unsigned().references('id').inTable('users');
        t.string('midtrans_order_id', 100).unique();
        t.string('midtrans_transaction_id', 100).nullable();
        t.enu('status', ['pending', 'paid', 'failed', 'cancelled', 'completed', 'disputed']).defaultTo('pending');
        t.decimal('subtotal', 12, 2);
        t.decimal('discount', 12, 2).defaultTo(0);
        t.decimal('platform_fee', 12, 2).defaultTo(0);
        t.decimal('payment_fee', 12, 2).defaultTo(0);
        t.decimal('total', 12, 2);
        t.string('payment_type', 50).nullable();
        t.string('promo_code', 50).nullable();
        t.timestamp('paid_at').nullable();
        t.timestamp('confirmed_at').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('order_items', (t) => {
        t.increments('id').primary();
        t.integer('order_id').unsigned().references('id').inTable('orders').onDelete('CASCADE');
        t.integer('product_id').unsigned().references('id').inTable('products');
        t.integer('qty').defaultTo(1);
        t.decimal('price', 12, 2);
        t.text('delivery_data').nullable();
      });
      await db.schema.createTable('deliveries', (t) => {
        t.increments('id').primary();
        t.integer('order_id').unsigned().references('id').inTable('orders').onDelete('CASCADE');
        t.integer('product_id').unsigned().references('id').inTable('products');
        t.enu('channel', ['email', 'whatsapp', 'telegram', 'discord']).defaultTo('email');
        t.string('recipient', 255).nullable();
        t.text('message').nullable();
        t.enu('status', ['pending', 'sent', 'failed', 'bounced']).defaultTo('pending');
        t.timestamp('sent_at').nullable();
      });
      await db.schema.createTable('promo_codes', (t) => {
        t.increments('id').primary();
        t.string('code', 50).unique();
        t.enu('type', ['percent', 'flat']).defaultTo('percent');
        t.decimal('value', 10, 2);
        t.decimal('min_order', 12, 2).defaultTo(0);
        t.integer('max_uses').nullable();
        t.integer('used_count').defaultTo(0);
        t.boolean('active').defaultTo(true);
        t.timestamp('expires_at').nullable();
        t.string('label', 100).nullable();
      });
      await db.schema.createTable('reviews', (t) => {
        t.increments('id').primary();
        t.integer('product_id').unsigned().references('id').inTable('products').onDelete('CASCADE');
        t.integer('user_id').unsigned().references('id').inTable('users');
        t.integer('rating').unsigned();
        t.text('text').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('escrow_holds', (t) => {
        t.increments('id').primary();
        t.integer('order_id').unsigned().references('id').inTable('orders').onDelete('CASCADE');
        t.integer('seller_id').unsigned().references('id').inTable('users');
        t.decimal('amount', 12, 2);
        t.decimal('seller_amount', 12, 2);
        t.decimal('platform_fee', 12, 2);
        t.decimal('payment_fee', 12, 2);
        t.enu('status', ['held', 'released', 'refunded']).defaultTo('held');
        t.timestamp('release_at').nullable();
        t.timestamp('released_at').nullable();
      });
      await db.schema.createTable('seller_balances', (t) => {
        t.integer('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
        t.decimal('available', 14, 2).defaultTo(0);
        t.decimal('pending', 14, 2).defaultTo(0);
        t.decimal('total_earned', 14, 2).defaultTo(0);
        t.timestamp('updated_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('withdrawals', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().references('id').inTable('users');
        t.decimal('amount', 12, 2);
        t.decimal('fee', 12, 2);
        t.decimal('net_amount', 12, 2);
        t.string('method', 50);
        t.text('account_info').nullable();
        t.enu('status', ['pending', 'processing', 'completed', 'rejected']).defaultTo('pending');
        t.timestamp('processed_at').nullable();
        t.text('notes').nullable();
      });
      await db.schema.createTable('transactions', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().references('id').inTable('users');
        t.decimal('amount', 12, 2);
        t.string('type', 30);
        t.string('reference_type', 50).nullable();
        t.integer('reference_id').unsigned().nullable();
        t.string('description', 255).nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('notifications', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
        t.string('type', 50);
        t.string('title', 200);
        t.text('body').nullable();
        t.timestamp('read_at').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('security_audit_log', (t) => {
        t.increments('id').primary();
        t.string('event_type', 50);
        t.integer('user_id').unsigned().nullable();
        t.string('ip', 45).nullable();
        t.text('user_agent').nullable();
        t.json('metadata').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      await db.schema.createTable('newsletter_subscribers', (t) => {
        t.increments('id').primary();
        t.string('email', 255).unique();
        t.string('source', 50).defaultTo('homepage');
        t.timestamp('subscribed_at').defaultTo(db.fn.now());
      });
    },
  },
  {
    name: '003_affiliate_support_views',
    up: async (db) => {
      // Affiliate program
      if (!(await db.schema.hasTable('affiliate_codes'))) {
        await db.schema.createTable('affiliate_codes', (t) => {
          t.increments('id').primary();
          t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
          t.string('code', 50).unique().notNullable();
          t.timestamp('created_at').defaultTo(db.fn.now());
        });
      }
      if (!(await db.schema.hasTable('affiliate_clicks'))) {
        await db.schema.createTable('affiliate_clicks', (t) => {
          t.increments('id').primary();
          t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
          t.string('code', 50);
          t.string('source', 100);
          t.timestamp('created_at').defaultTo(db.fn.now());
        });
      }
      if (!(await db.schema.hasTable('affiliate_referrals'))) {
        await db.schema.createTable('affiliate_referrals', (t) => {
          t.increments('id').primary();
          t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
          t.integer('referred_user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
          t.integer('order_id').unsigned().nullable();
          t.decimal('commission', 12, 2).defaultTo(0);
          t.enu('status', ['pending', 'converted', 'paid', 'cancelled']).defaultTo('pending');
          t.boolean('paid').defaultTo(false);
          t.timestamp('created_at').defaultTo(db.fn.now());
        });
      }
      // Support tickets
      if (!(await db.schema.hasTable('support_tickets'))) {
        await db.schema.createTable('support_tickets', (t) => {
          t.increments('id').primary();
          t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
          t.string('subject', 200);
          t.enu('status', ['open', 'pending', 'closed']).defaultTo('open');
          t.enu('priority', ['low', 'normal', 'high', 'urgent']).defaultTo('normal');
          t.timestamp('created_at').defaultTo(db.fn.now());
          t.timestamp('updated_at').defaultTo(db.fn.now());
        });
      }
      if (!(await db.schema.hasTable('support_messages'))) {
        await db.schema.createTable('support_messages', (t) => {
          t.increments('id').primary();
          t.integer('ticket_id').unsigned().references('id').inTable('support_tickets').onDelete('CASCADE');
          t.integer('user_id').unsigned().references('id').inTable('users');
          t.text('message');
          t.enu('from', ['user', 'admin', 'system']).defaultTo('user');
          t.timestamp('created_at').defaultTo(db.fn.now());
        });
      }
      // Product views (for recently-viewed feature)
      if (!(await db.schema.hasTable('product_views'))) {
        await db.schema.createTable('product_views', (t) => {
          t.increments('id').primary();
          t.integer('product_id').unsigned().references('id').inTable('products').onDelete('CASCADE');
          t.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE');
          t.string('source', 50);
          t.timestamp('created_at').defaultTo(db.fn.now());
        });
      }
      // Payout settings (for seller withdrawals)
      if (!(await db.schema.hasTable('payout_settings'))) {
        await db.schema.createTable('payout_settings', (t) => {
          t.integer('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
          t.string('bank_name', 100).nullable();
          t.string('account_number', 50).nullable();
          t.string('account_name', 100).nullable();
          t.string('ewallet_type', 50).nullable();
          t.string('ewallet_number', 50).nullable();
          t.timestamp('updated_at').defaultTo(db.fn.now());
        });
      }
    },
  },
  {
    name: '004_payout_settings',
    up: async (db) => {
      if (!(await db.schema.hasTable('payout_settings'))) {
        await db.schema.createTable('payout_settings', (t) => {
          t.integer('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
          t.string('bank_name', 100).nullable();
          t.string('account_number', 50).nullable();
          t.string('account_name', 100).nullable();
          t.string('ewallet_type', 50).nullable();
          t.string('ewallet_number', 50).nullable();
          t.timestamp('updated_at').defaultTo(db.fn.now());
        });
      }
    },
  },
  {
    name: '002_dev_view_as_role',
    up: async (db) => {
      // No schema change; placeholder for future permission override
    },
  },
];

export async function migrate() {
  const dbi = db();
  // migrations tracking
  if (!(await dbi.schema.hasTable('_migrations'))) {
    await dbi.schema.createTable('_migrations', (t) => {
      t.increments('id').primary();
      t.string('name').unique();
      t.timestamp('run_at').defaultTo(dbi.fn.now());
    });
  }
  for (const m of SCHEMA) {
    const existing = await dbi('_migrations').where({ name: m.name }).first();
    if (existing) {
      console.log(`✓ ${m.name} (already applied)`);
      continue;
    }
    console.log(`→ Running ${m.name}...`);
    try {
      await m.up(dbi);
      await dbi('_migrations').insert({ name: m.name });
      console.log(`✓ ${m.name} done`);
    } catch (e) {
      console.error(`✗ ${m.name} failed: ${e.message}`);
      // Don't throw — skip and continue
    }
  }
  console.log('\nAll migrations processed.');
  // NOTE: don't destroy the default db instance — it's used by routes too
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((e) => { console.error('Migration failed:', e); process.exit(1); });
}
