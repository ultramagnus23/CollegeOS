#!/usr/bin/env node

/**
 * Database Setup Script
 * 
 * Ensures database directory exists and runs complete setup:
 * 1. Create database directory if missing
 * 2. Run migrations
 * 3. Seed database
 * 4. Verify setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      DATABASE SETUP TOOL                               ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const dbDir = path.join(__dirname, '..', 'database');
const dbPath = path.join(dbDir, 'college_app.db');

// Step 1: Ensure database directory exists
console.log('📁 Step 1: Ensuring database directory exists...');
if (!fs.existsSync(dbDir)) {
  console.log('   Creating database directory...');
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('✅ Created: ' + dbDir);
} else {
  console.log('✅ Directory exists: ' + dbDir);
}

// Step 2: Check if database file exists
console.log('\n📄 Step 2: Checking database file...');
const dbExists = fs.existsSync(dbPath);
if (dbExists) {
  const stats = fs.statSync(dbPath);
  console.log(`✅ Database exists (${(stats.size / 1024).toFixed(2)} KB)`);
  console.log(`   Last modified: ${stats.mtime.toLocaleString()}`);
} else {
  console.log('⚠️  Database file does not exist yet');
}

// Step 3: Run migrations
console.log('\n🔧 Step 3: Running migrations...');
try {
  console.log('   Executing: node scripts/runMigrations.js');
  execSync('node scripts/runMigrations.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  console.log('✅ Migrations completed successfully');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  console.log('\n🔧 FIX: Try running migrations manually:');
  console.log('   cd backend && node scripts/runMigrations.js');
  process.exit(1);
}

// Step 4: Check if seeding is needed
console.log('\n🌱 Step 4: Checking if seeding is needed...');
let needsSeeding = true;

try {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  const result = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`   Current college count: ${result.count}`);
  
  if (result.count > 0) {
    console.log('✅ Database already has colleges');
    needsSeeding = false;
  } else {
    console.log('⚠️  Database is empty, seeding required');
  }
  db.close();
} catch (err) {
  console.log('⚠️  Cannot check database, will attempt seeding');
}

// Step 5: Seed database if needed
if (needsSeeding) {
  console.log('\n📦 Step 5: Seeding database...');
  try {
    console.log('   Executing: node scripts/seedFromUnifiedData.js --force');
    execSync('node scripts/seedFromUnifiedData.js --force', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('✅ Seeding completed successfully');
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    console.log('\n🔧 FIX: Try running seed manually:');
    console.log('   cd backend && node scripts/seedFromUnifiedData.js --force');
    process.exit(1);
  }
} else {
  console.log('\n✅ Step 5: Skipping seeding (database has data)');
}

// Step 6: Final verification
console.log('\n✅ Step 6: Final verification...');
try {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  const result = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`   ✅ Database has ${result.count} colleges`);
  
  if (result.count > 0) {
    const sample = db.prepare('SELECT name FROM colleges LIMIT 3').all();
    console.log('   Sample colleges:');
    sample.forEach(c => console.log(`   - ${c.name}`));
  }
  db.close();
} catch (err) {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
}

// Success!
console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║      SETUP COMPLETE! 🎉                                ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('\n🚀 Next steps:');
console.log('   1. Start backend: npm run backend:dev');
console.log('   2. Test API: curl http://localhost:3000/api/colleges');
console.log('   3. View data: node scripts/viewCollegeData.js "Harvard"');
console.log('\n📊 Helpful commands:');
console.log('   - Diagnose issues: node scripts/diagnoseDatabase.js');
console.log('   - View changes: node scripts/viewDatabaseChanges.js');
console.log('   - Re-seed: node scripts/seedFromUnifiedData.js --force');

process.exit(0);
