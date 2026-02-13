#!/usr/bin/env node

/**
 * Database Diagnostic Script
 * 
 * Checks database status, college count, and helps troubleshoot
 * "zero colleges" issues after seeding.
 */

const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      DATABASE DIAGNOSTIC TOOL                          ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const dbPath = path.join(__dirname, '..', 'database', 'college_app.db');
const dataDir = path.join(__dirname, '..', 'database');
const seedFile = path.join(__dirname, '..', 'data', 'unified_colleges.json');

// Step 1: Check database directory
console.log('📁 Step 1: Checking database directory...');
if (!fs.existsSync(dataDir)) {
  console.log('❌ ERROR: Database directory does NOT exist!');
  console.log(`   Expected: ${dataDir}`);
  console.log('\n🔧 FIX: Create the directory:');
  console.log(`   mkdir -p ${dataDir}`);
  process.exit(1);
} else {
  console.log('✅ Database directory exists');
}

// Step 2: Check database file
console.log('\n📄 Step 2: Checking database file...');
if (!fs.existsSync(dbPath)) {
  console.log('❌ ERROR: Database file does NOT exist!');
  console.log(`   Expected: ${dbPath}`);
  console.log('\n🔧 FIX: Run migrations to create database:');
  console.log('   npm run migrate');
  process.exit(1);
} else {
  const stats = fs.statSync(dbPath);
  console.log('✅ Database file exists');
  console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
  
  if (stats.size < 1000) {
    console.log('⚠️  WARNING: Database file is very small (< 1KB)');
    console.log('   This suggests it may be empty or corrupted');
  }
}

// Step 3: Check seed file
console.log('\n📦 Step 3: Checking seed data file...');
if (!fs.existsSync(seedFile)) {
  console.log('❌ ERROR: Seed data file does NOT exist!');
  console.log(`   Expected: ${seedFile}`);
  console.log('\n🔧 FIX: Ensure unified_colleges.json is in backend/data/');
  process.exit(1);
} else {
  const stats = fs.statSync(seedFile);
  console.log('✅ Seed data file exists');
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

// Step 4: Try to connect and query database
console.log('\n🔌 Step 4: Connecting to database...');
let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  console.log('✅ Successfully connected to database');
} catch (err) {
  console.log('❌ ERROR: Cannot load database library');
  console.log(`   Error: ${err.message}`);
  console.log('\n🔧 FIX: Install dependencies:');
  console.log('   npm install');
  process.exit(1);
}

// Step 5: Check tables
console.log('\n📋 Step 5: Checking database tables...');
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log(`✅ Found ${tables.length} tables`);
  
  const importantTables = ['colleges', 'users', 'colleges_comprehensive', 'college_admissions'];
  const missingTables = importantTables.filter(t => !tables.find(table => table.name === t));
  
  if (missingTables.length > 0) {
    console.log(`❌ ERROR: Missing important tables: ${missingTables.join(', ')}`);
    console.log('\n🔧 FIX: Run migrations:');
    console.log('   npm run migrate');
    process.exit(1);
  }
} catch (err) {
  console.log('❌ ERROR querying tables:', err.message);
  process.exit(1);
}

// Step 6: Check college count
console.log('\n🎓 Step 6: Checking college count...');
try {
  const result = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`   Total colleges: ${result.count}`);
  
  if (result.count === 0) {
    console.log('\n❌ ERROR: Database is EMPTY! No colleges found.');
    console.log('\n🔧 FIX: Run seeding:');
    console.log('   npm run seed');
    console.log('   OR');
    console.log('   cd backend && node scripts/seedFromUnifiedData.js --force');
    process.exit(1);
  } else if (result.count < 100) {
    console.log('⚠️  WARNING: Very few colleges found');
    console.log('   Expected: 6000+ colleges');
    console.log('   Consider re-seeding with --force flag');
  } else {
    console.log('✅ Database has colleges!');
  }
  
  // Show sample
  const sample = db.prepare('SELECT id, name, city, state FROM colleges LIMIT 5').all();
  console.log('\n📝 Sample colleges:');
  sample.forEach(c => {
    console.log(`   ${c.id}. ${c.name} (${c.city}, ${c.state})`);
  });
  
} catch (err) {
  console.log('❌ ERROR querying colleges:', err.message);
  process.exit(1);
}

// Step 7: Check API configuration
console.log('\n⚙️  Step 7: Checking configuration...');
const envFile = path.join(__dirname, '..', '.env');
const envExampleFile = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envFile)) {
  console.log('⚠️  WARNING: .env file not found');
  if (fs.existsSync(envExampleFile)) {
    console.log('   Found .env.example - consider copying it:');
    console.log('   cp backend/.env.example backend/.env');
  }
} else {
  console.log('✅ .env file exists');
}

// Step 8: Success summary
console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║      DIAGNOSTIC COMPLETE                               ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('\n✅ All checks passed!');
console.log('\n🚀 Your database is ready. To use it:');
console.log('   1. Start backend: npm run backend:dev');
console.log('   2. API will be at: http://localhost:3000');
console.log('   3. Test: curl http://localhost:3000/api/colleges');
console.log('\n📊 To view data:');
console.log('   node scripts/viewDatabaseChanges.js');
console.log('   node scripts/viewCollegeData.js "Duke University"');

db.close();
process.exit(0);
