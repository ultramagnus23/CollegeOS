// backend/scripts/runMigrations.js
// This script runs all database migrations in order
// Run this with: node backend/scripts/runMigrations.js

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Database path - adjust if your structure is different
const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Create a new database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Create a migrations tracking table
// This keeps track of which migrations have already been run
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

// Get list of already executed migrations
function getExecutedMigrations() {
  return new Promise((resolve, reject) => {
    db.all('SELECT filename FROM migrations ORDER BY filename', (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => row.filename));
    });
  });
}

// Record that a migration has been executed
function recordMigration(filename) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO migrations (filename) VALUES (?)', [filename], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Execute a single migration file
function executeMigration(filename, sql) {
  return new Promise((resolve, reject) => {
    // Split SQL by semicolons and execute each statement
    // This handles multiple statements in one migration file
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    let completed = 0;
    
    function executeNext() {
      if (completed >= statements.length) {
        resolve();
        return;
      }
      
      const statement = statements[completed];
      db.run(statement, (err) => {
        if (err) {
          console.error(`  ❌ Error in statement ${completed + 1}:`, err.message);
          reject(err);
        } else {
          completed++;
          executeNext();
        }
      });
    }
    
    executeNext();
  });
}

// Main migration function
async function runMigrations() {
  try {
    console.log('\n🔄 Starting database migrations...\n');
    
    // Step 1: Create migrations tracking table
    await createMigrationsTable();
    console.log('✅ Migrations tracking table ready\n');
    
    // Step 2: Get list of already executed migrations
    const executedMigrations = await getExecutedMigrations();
    console.log(`📋 Found ${executedMigrations.length} previously executed migrations\n`);
    
    // Step 3: Read all migration files from the migrations directory
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure they run in order (001, 002, 003, etc.)
    
    console.log(`📁 Found ${migrationFiles.length} migration files\n`);
    
    // Step 4: Execute each migration that hasn't been run yet
    let newMigrationsCount = 0;
    
    for (const filename of migrationFiles) {
      // Skip if already executed
      if (executedMigrations.includes(filename)) {
        console.log(`⏭️  Skipping ${filename} (already executed)`);
        continue;
      }
      
      console.log(`🔨 Executing ${filename}...`);
      
      // Read the SQL file
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filepath, 'utf8');
      
      // Execute the migration
      await executeMigration(filename, sql);
      
      // Record that it's been executed
      await recordMigration(filename);
      
      console.log(`✅ ${filename} completed successfully\n`);
      newMigrationsCount++;
    }
    
    // Step 5: Report results
    console.log('━'.repeat(50));
    if (newMigrationsCount === 0) {
      console.log('✨ Database is up to date! No new migrations to run.');
    } else {
      console.log(`✨ Successfully executed ${newMigrationsCount} new migration(s)!`);
    }
    console.log('━'.repeat(50) + '\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      }
      process.exit(0);
    });
  }
}

// Run the migrations
runMigrations();