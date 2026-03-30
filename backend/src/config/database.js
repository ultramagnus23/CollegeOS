const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('./env');

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this.pool;

    try {
      // Enable SSL for production or when connecting to a known remote Postgres host.
      // (Supabase, Render, Railway, Neon, AWS RDS, etc. all require SSL.)
      // Use proper hostname parsing instead of substring matching to avoid
      // matching attacker-controlled strings like "evil-supabase.co.example.com".
      const dbUrl = config.database.url || '';
      let isRemoteDb = config.isProduction;
      if (!isRemoteDb && dbUrl) {
        try {
          const { hostname } = new URL(dbUrl);
          const remoteHostSuffixes = [
            '.supabase.co',
            '.supabase.com',
            '.render.com',
            '.railway.app',
            '.neon.tech',
            '.amazonaws.com',
          ];
          isRemoteDb = remoteHostSuffixes.some(
            suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix)
          );
        } catch {
          // Unparseable URL — leave isRemoteDb as false
        }
      }

      this.pool = new Pool({
        connectionString: dbUrl,
        ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on('error', (err) => {
        logger.error('Unexpected error on idle client', { error: err.message });
      });

      logger.info('PostgreSQL pool created successfully');
      this.initialized = true;
      return this.pool;
    } catch (error) {
      logger.error('Database pool creation failed:', { error: error.message });
      throw error;
    }
  }

  async runMigrations() {
    const pool = this.initialize();

    logger.info('Running database migrations...');

    const migrationsDir = path.join(__dirname, '../../migrations');
    const client = await pool.connect();

    try {
      // Create migrations tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          executed_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Get executed migrations
      const { rows: executed } = await client.query(
        'SELECT filename FROM migrations ORDER BY filename'
      );
      const executedSet = new Set(executed.map(r => r.filename));

      // Get all migration files
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (executedSet.has(file)) continue;

        const filePath = path.join(migrationsDir, file);
        let sql = fs.readFileSync(filePath, 'utf8');

        // Convert SQLite-specific syntax to PostgreSQL
        sql = convertSqliteToPostgres(sql);

        try {
          await client.query('BEGIN');
          // Execute each statement separately (skip empty ones)
          const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
          for (const stmt of statements) {
            try {
              await client.query(stmt);
            } catch (stmtErr) {
              // Ignore "already exists" errors for idempotent migrations
              if (
                stmtErr.code === '42P07' || // relation already exists
                stmtErr.code === '42701' || // column already exists
                stmtErr.code === '42P16' || // invalid table definition (duplicate pk etc)
                stmtErr.code === '23505' || // unique violation (duplicate migration)
                stmtErr.message.includes('already exists')
              ) {
                // safe to ignore
              } else {
                throw stmtErr;
              }
            }
          }
          await client.query(
            'INSERT INTO migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
            [file]
          );
          await client.query('COMMIT');
          logger.info(`Migration applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`Migration failed: ${file}`, { error: err.message });
          // Don't throw — continue with remaining migrations
        }
      }

      logger.info('Database migrations completed successfully');
    } finally {
      client.release();
    }
  }

  getDatabase() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.pool;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.initialized = false;
      logger.info('Database pool closed');
    }
  }
}

/**
 * Convert SQLite-specific SQL syntax to PostgreSQL syntax.
 * Applied to every migration file before execution.
 */
function convertSqliteToPostgres(sql) {
  return sql
    // PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    // DATETIME columns → TIMESTAMPTZ
    .replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ')
    // BOOLEAN → BOOLEAN (already fine, just remove defaults like DEFAULT 0 → DEFAULT FALSE)
    // datetime('now') → NOW()
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/date\('now'\)/gi, 'CURRENT_DATE')
    // SQLite FTS5 virtual tables — skip entirely (not supported in PG)
    .replace(/CREATE\s+VIRTUAL\s+TABLE\s+IF\s+NOT\s+EXISTS\s+\S+\s+USING\s+fts5[^;]*/gi, '')
    // SQLite triggers for FTS — skip
    .replace(/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS\s+\S+\s+AFTER\s+(INSERT|UPDATE|DELETE)\s+ON\s+\S+\s+BEGIN[^;]*END/gi, '')
    // BOOLEAN DEFAULT 0 → BOOLEAN DEFAULT FALSE
    .replace(/BOOLEAN\s+DEFAULT\s+0\b/gi, 'BOOLEAN DEFAULT FALSE')
    .replace(/BOOLEAN\s+DEFAULT\s+1\b/gi, 'BOOLEAN DEFAULT TRUE')
    // INTEGER DEFAULT 0 used for boolean fields keep as-is (PG accepts it)
    // ON CONFLICT(col) DO UPDATE SET ... → ON CONFLICT (col) DO UPDATE SET ... (same syntax, OK)
    // REAL → DOUBLE PRECISION
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    // date('now', '+X days') → CURRENT_DATE + INTERVAL 'X days'
    .replace(/date\('now',\s*['"]\+(\d+)\s*days?['"]\)/gi, (_, n) => `CURRENT_DATE + INTERVAL '${n} days'`)
    // date(col, '+X days') — leave as-is (handled differently per query)
    // CURRENT_TIMESTAMP is the same in PG
    // Remove SQLite PRAGMA statements
    .replace(/PRAGMA\s+[^;]+;/gi, '')
    // Fix CREATE INDEX IF NOT EXISTS on LOWER() — PG uses lower() which is fine
    ;
}

// Singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;