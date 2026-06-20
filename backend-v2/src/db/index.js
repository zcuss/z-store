// DB Adapter — supports MySQL/MariaDB, PostgreSQL/CockroachDB, SQLite via Knex
// Usage: DB_DRIVER=mysql|postgres|sqlite|cockroach
//        DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

import knex from 'knex';

const drivers = {
  mysql: (cfg) => ({
    client: 'mysql2',
    connection: {
      host: cfg.host || '127.0.0.1',
      port: cfg.port || 3306,
      user: cfg.user || 'root',
      password: cfg.password || '',
      database: cfg.name || 'zcuss_zshop',
      charset: 'utf8mb4',
      timezone: '+07:00',
      dateStrings: true,
    },
    pool: { min: 2, max: 10 },
  }),
  postgres: (cfg) => ({
    client: 'pg',
    connection: {
      host: cfg.host || '127.0.0.1',
      port: cfg.port || 5432,
      user: cfg.user || 'postgres',
      password: cfg.password || '',
      database: cfg.name || 'zcuss_zshop',
    },
    pool: { min: 2, max: 10 },
  }),
  cockroach: (cfg) => ({
    client: 'pg',
    connection: {
      host: cfg.host || '127.0.0.1',
      port: cfg.port || 26257,
      user: cfg.user || 'root',
      password: cfg.password || '',
      database: cfg.name || 'zcuss_zshop',
      ssl: cfg.ssl === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: { min: 2, max: 10 },
  }),
  sqlite: (cfg) => ({
    client: 'better-sqlite3',
    connection: {
      filename: cfg.file || './data/zstore.db',
    },
    useNullAsDefault: true,
  }),
};

export function createDb(config = {}) {
  const driver = (config.driver || process.env.DB_DRIVER || 'mysql').toLowerCase();
  const cfg = {
    host: config.host || process.env.DB_HOST,
    port: parseInt(config.port || process.env.DB_PORT || '0') || undefined,
    user: config.user || process.env.DB_USER,
    password: config.password || process.env.DB_PASSWORD || process.env.DB_PASS,
    name: config.name || process.env.DB_NAME,
    file: config.file || process.env.DB_FILE,
    ssl: config.ssl || process.env.DB_SSL,
  };

  const factory = drivers[driver];
  if (!factory) throw new Error(`Unsupported DB_DRIVER: ${driver}. Use one of: ${Object.keys(drivers).join(', ')}`);

  const db = knex(factory(cfg));
  db.driver = driver;

  // Helper: query with timing log (dev only)
  if (process.env.DB_LOG === 'true') {
    db.on('query-response', (res, opts) => {
      console.log(`[DB ${opts.type}] ${opts.sql.slice(0, 200)}`);
    });
  }

  return db;
}

// Helper: build column list for portable pagination
export const paginationClause = (db, page, perPage = 20) => {
  const offset = Math.max(0, (page - 1) * perPage);
  if (db.driver === 'sqlite') {
    return { limit: perPage, offset };
  }
  return { limit: perPage, offset };
};

// Helper: portable JSON_EXTRACT / json_each
export const jsonExtract = (db, column, path) => {
  if (db.driver === 'sqlite') return knex.raw(`json_extract(??, ??)`, [column, path]);
  return knex.raw(`JSON_EXTRACT(??, ?)`, [column, path]);
};

// Default instance
let _defaultDb = null;
export function db() {
  if (!_defaultDb) _defaultDb = createDb();
  return _defaultDb;
}
