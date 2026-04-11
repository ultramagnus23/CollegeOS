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
          // Execute each statement separately (skip empty ones).
          // splitSqlStatements() handles dollar-quoted PL/pgSQL blocks
          // (DO $$ ... $$;) so inner semicolons are not used as delimiters.
          const statements = splitSqlStatements(sql);
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
 * Split a SQL string into individual statements, correctly handling:
 *   - Dollar-quoted blocks:  DO $$ ... $$;  /  DO $body$ ... $body$;
 *   - Single-quoted strings: '...'  (with '' escapes)
 *   - Line comments:         -- ...
 *   - Block comments:        /* ... *\/
 *
 * The plain sql.split(';') approach breaks PL/pgSQL blocks because the
 * semicolons inside the $$ body are used as delimiters.  This function
 * only treats a ';' as a statement terminator when it is NOT inside any
 * of the constructs above.
 *
 * @param {string} sql - Raw SQL text (possibly multi-statement)
 * @returns {string[]} Array of trimmed, non-empty statement strings
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  const len = sql.length;

  while (i < len) {
    // ── Line comment: -- ... \n ────────────────────────────────────────────
    if (sql[i] === '-' && i + 1 < len && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      if (end === -1) { current += sql.slice(i); i = len; }
      else            { current += sql.slice(i, end + 1); i = end + 1; }
      continue;
    }

    // ── Block comment: /* ... */ ───────────────────────────────────────────
    if (sql[i] === '/' && i + 1 < len && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) { current += sql.slice(i); i = len; }
      else            { current += sql.slice(i, end + 2); i = end + 2; }
      continue;
    }

    // ── Dollar-quoted string: $tag$ ... $tag$ ────────────────────────────
    if (sql[i] === '$') {
      // Scan forward for the closing '$' of the opening tag
      let tagEnd = i + 1;
      while (tagEnd < len && sql[tagEnd] !== '$' && sql[tagEnd] !== '\n') tagEnd++;
      if (tagEnd < len && sql[tagEnd] === '$') {
        const tag = sql.slice(i, tagEnd + 1); // e.g. '$$' or '$body$'
        const closePos = sql.indexOf(tag, tagEnd + 1);
        if (closePos !== -1) {
          current += sql.slice(i, closePos + tag.length);
          i = closePos + tag.length;
          continue;
        }
      }
    }

    // ── Single-quoted string: '...' ('' = escaped quote) ─────────────────
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < len) {
        if (sql[j] === "'" && j + 1 < len && sql[j + 1] === "'") { j += 2; }
        else if (sql[j] === "'")                                   { j++; break; }
        else                                                        { j++; }
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // ── Statement terminator ──────────────────────────────────────────────
    if (sql[i] === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const stmt = current.trim();
  if (stmt) statements.push(stmt);
  return statements;
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

/**
 * Test the database connection by running a trivial query.
 * Logs success with the database name and timestamp, or calls process.exit(1) on failure.
 */
async function testConnection() {
  try {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT NOW() AS now, current_database() AS db');
    const { now, db } = rows[0];
    logger.info(`Database connection OK — db: ${db}, server time: ${now}`);
  } catch (err) {
    logger.error('Database connection test FAILED:', { error: err.message });
    process.exit(1);
  }
}

/**
 * Run a keep-alive ping every 4 minutes to prevent the connection pool from
 * being reaped by Render's free tier idle timeout.
 * Failures only log a warning — they do not crash the server.
 */
function startKeepAlive() {
  setInterval(async () => {
    try {
      const pool = dbManager.getDatabase();
      await pool.query('SELECT 1');
    } catch (err) {
      logger.warn('Keep-alive ping failed (non-fatal):', { error: err.message });
    }
  }, 4 * 60 * 1000); // 4 minutes
}

module.exports = dbManager;
module.exports.testConnection = testConnection;
module.exports.startKeepAlive = startKeepAlive;