#!/usr/bin/env node

/**
 * Database Diagnostic Script
 *
 * Checks PostgreSQL database status, college count, and helps troubleshoot issues.
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      DATABASE DIAGNOSTIC TOOL                          ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const seedFile = path.join(__dirname, '..', 'data', 'unified_colleges.json');

async function main() {
  const dbManager = require('../src/config/database');

  // Step 1: Check seed data file
  console.log('📦 Step 1: Checking seed data file...');
  if (!fs.existsSync(seedFile)) {
    console.log('⚠️  WARNING: Seed data file does not exist');
    console.log(`   Expected: ${seedFile}`);
  } else {
    const stats = fs.statSync(seedFile);
    console.log('✅ Seed data file exists');
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }

  // Step 2: Connect to PostgreSQL
  console.log('\n🔌 Step 2: Connecting to PostgreSQL...');
  let pool;
  try {
    dbManager.initialize();
    pool = dbManager.getDatabase();
    await pool.query('SELECT 1');
    console.log('✅ Successfully connected to PostgreSQL');
  } catch (err) {
    console.log('❌ ERROR: Cannot connect to PostgreSQL');
    console.log(`   Error: ${err.message}`);
    console.log('\n🔧 FIX: Check your DATABASE_URL in backend/.env');
    process.exit(1);
  }

  // Step 3: Check tables
  console.log('\n📋 Step 3: Checking database tables...');
  try {
    const { rows: tables } = await pool.query(`
      SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'
    `);
    console.log(`✅ Found ${tables.length} tables`);

    const importantTables = ['colleges', 'users', 'colleges_comprehensive', 'college_admissions'];
    const missingTables = importantTables.filter(t => !tables.find(table => table.name === t));

    if (missingTables.length > 0) {
      console.log(`❌ ERROR: Missing important tables: ${missingTables.join(', ')}`);
      console.log('\n🔧 FIX: Run migrations:');
      console.log('   npm run migrate');
      await dbManager.close();
      process.exit(1);
    }
  } catch (err) {
    console.log('❌ ERROR querying tables:', err.message);
    await dbManager.close();
    process.exit(1);
  }

  // Step 4: Check college count
  console.log('\n🎓 Step 4: Checking college count...');
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM colleges');
    const count = parseInt(rows[0].count);
    console.log(`   Total colleges: ${count}`);

    if (count === 0) {
      console.log('\n❌ ERROR: Database is EMPTY! No colleges found.');
      console.log('\n🔧 FIX: Run seeding:');
      console.log('   npm run seed');
      console.log('   OR');
      console.log('   cd backend && node scripts/seedFromUnifiedData.js --force');
      await dbManager.close();
      process.exit(1);
    } else if (count < 100) {
      console.log('⚠️  WARNING: Very few colleges found');
      console.log('   Expected: 6000+ colleges');
      console.log('   Consider re-seeding with --force flag');
    } else {
      console.log('✅ Database has colleges!');
    }

    const { rows: sample } = await pool.query('SELECT id, name FROM colleges LIMIT 5');
    console.log('\n📝 Sample colleges:');
    sample.forEach(c => console.log(`   ${c.id}. ${c.name}`));
  } catch (err) {
    console.log('❌ ERROR querying colleges:', err.message);
    await dbManager.close();
    process.exit(1);
  }

  // Step 5: Check API configuration
  console.log('\n⚙️  Step 5: Checking configuration...');
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

  await dbManager.close();

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
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
