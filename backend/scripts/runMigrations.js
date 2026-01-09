// backend/scripts/migrate.js
// Improved migration script with better error handling

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'college_app.db');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Create migrations tracking table
function createMigrationsTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Get list of executed migrations
function getExecutedMigrations() {
  return new Promise((resolve, reject) => {
    db.all('SELECT filename FROM migrations ORDER BY filename', (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => row.filename));
    });
  });
}

// Record migration as executed
function recordMigration(filename) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO migrations (filename) VALUES (?)', [filename], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Execute a single migration file with better error handling
function executeMigration(filename, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        console.error(`❌ Error executing migration ${filename}`);
        console.error(err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


// Main migration function
async function runMigrations() {
  try {
    console.log('\n🔄 Starting database migrations...\n');
    
    // Create migrations tracking table
    await createMigrationsTable();
    console.log('✅ Migrations tracking table ready\n');
    
    // Get executed migrations
    const executedMigrations = await getExecutedMigrations();
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
        await executeMigration(filename, sql);
        
        // Record as executed
        await recordMigration(filename);
        
        console.log(`✅ ${filename} completed successfully\n`);
        newMigrationsCount++;
      } catch (error) {
        console.error(`\n❌ Migration ${filename} failed!`);
        console.error(`   Error: ${error.message}`);
        console.error('\n💡 Fix the SQL file and run migrations again.\n');
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
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      }
      process.exit(0);
    });
  }
}

// Run migrations
runMigrations();