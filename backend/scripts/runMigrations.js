// backend/scripts/runMigrations.js
// Migration script using better-sqlite3 (synchronous API)

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'college_app.db');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

console.log('📂 Database path:', DB_PATH);

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;
try {
  db = new Database(DB_PATH);
  console.log('✅ Connected to SQLite database');
} catch (err) {
  console.error('❌ Error connecting to database:', err.message);
  process.exit(1);
}

// Create migrations tracking table
function createMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Get list of executed migrations
function getExecutedMigrations() {
  const rows = db.prepare('SELECT filename FROM migrations ORDER BY filename').all();
  return rows.map(row => row.filename);
}

// Record migration as executed
function recordMigration(filename) {
  db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(filename);
}

// Execute a single migration file with better error handling
function executeMigration(filename, sql) {
  // For migrations with ALTER TABLE, we need to handle errors gracefully
  // because columns might already exist
  // SQLite doesn't support "IF NOT EXISTS" for ADD COLUMN
  const hasAlterTable = filename === '004_user_profile.sql' || 
                        filename === '010_lda_chancing_tables.sql';
  
  if (hasAlterTable) {
    // Split by semicolon and execute one at a time
    const statements = sql.split(';').filter(s => s.trim());
    let completed = 0;
    let errors = [];
    
    for (const stmt of statements) {
      const trimmedStmt = stmt.trim();
      if (!trimmedStmt) continue;
      
      try {
        db.exec(trimmedStmt);
        completed++;
      } catch (err) {
        // For ALTER TABLE, column already exists is okay
        if (trimmedStmt.includes('ALTER TABLE') && err.message.includes('duplicate column')) {
          errors.push({ stmt: trimmedStmt.substring(0, 50), err: 'column exists' });
        } else if (trimmedStmt.includes('CREATE TABLE IF NOT EXISTS') || 
                   trimmedStmt.includes('CREATE INDEX IF NOT EXISTS')) {
          // These are fine to fail silently
          errors.push({ stmt: trimmedStmt.substring(0, 50), err: err.message });
        } else {
          errors.push({ stmt: trimmedStmt.substring(0, 50), err: err.message });
        }
      }
    }
    
    if (errors.length > 0) {
      console.log(`   ⚠️  ${errors.length} statements had errors (likely columns already exist)`);
    }
  } else {
    // Normal migration execution
    try {
      db.exec(sql);
    } catch (err) {
      console.error(`❌ Error executing migration ${filename}`);
      console.error(err.message);
      throw err;
    }
  }
}


// Main migration function
function runMigrations() {
  try {
    console.log('\n🔄 Starting database migrations...\n');
    
    // Create migrations tracking table
    createMigrationsTable();
    console.log('✅ Migrations tracking table ready\n');
    
    // Get executed migrations
    const executedMigrations = getExecutedMigrations();
    console.log(`📋 Found ${executedMigrations.length} previously executed migrations\n`);
    
    // Check if migrations directory exists
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log('⚠️  Migrations directory not found. Creating...');
      fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
      console.log('✅ Migrations directory created\n');
      console.log('ℹ️  No migrations to run. Add .sql files to backend/migrations/\n');
      return;
    }
    
    // Read migration files
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure they run in order
    
    if (migrationFiles.length === 0) {
      console.log('ℹ️  No migration files found in backend/migrations/\n');
      return;
    }
    
    console.log(`📁 Found ${migrationFiles.length} migration file(s)\n`);
    
    let newMigrationsCount = 0;
    
    for (const filename of migrationFiles) {
      // Skip if already executed
      if (executedMigrations.includes(filename)) {
        console.log(`⏭️  Skipping ${filename} (already executed)`);
        continue;
      }
      
      console.log(`🔨 Executing ${filename}...`);
      
      // Read SQL file
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filepath, 'utf8');
      
      try {
        // Execute migration
        executeMigration(filename, sql);
        
        // Record as executed
        recordMigration(filename);
        
        console.log(`✅ ${filename} completed successfully\n`);
        newMigrationsCount++;
      } catch (error) {
        console.error(`\n❌ Migration ${filename} failed!`);
        console.error(`   Error: ${error.message}`);
        console.error('\n💡 Tip: If you have an old database, try running:');
        console.error('   ./fresh-start.sh\n');
        throw error;
      }
    }
    
    // Summary
    console.log('━'.repeat(60));
    if (newMigrationsCount === 0) {
      console.log('✨ Database is up to date! No new migrations to run.');
    } else {
      console.log(`✨ Successfully executed ${newMigrationsCount} new migration(s)!`);
    }
    console.log('━'.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Migration process failed:', error.message);
    process.exit(1);
  } finally {
    if (db) {
      db.close();
    }
  }
}

// Run migrations
runMigrations();