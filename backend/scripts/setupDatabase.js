#!/usr/bin/env node

/**
 * Database Setup Script
 *
 * Runs complete setup:
 * 1. Run migrations
 * 2. Check if seeding is needed
 * 3. Seed database if empty
 * 4. Verify setup
 */

const { execSync } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      DATABASE SETUP TOOL                               ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

async function main() {
  const dbManager = require('../src/config/database');
  dbManager.initialize();
  const pool = dbManager.getDatabase();

  // Step 1: Run migrations
  console.log('🔧 Step 1: Running migrations...');
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
    await dbManager.close();
    process.exit(1);
  }

  // Step 2: Check if seeding is needed
  console.log('\n🌱 Step 2: Checking if seeding is needed...');
  let needsSeeding = true;
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM colleges');
    const count = parseInt(rows[0].count);
    console.log(`   Current college count: ${count}`);
    if (count > 0) {
      console.log('✅ Database already has colleges');
      needsSeeding = false;
    } else {
      console.log('⚠️  Database is empty, seeding required');
    }
  } catch (err) {
    console.log('⚠️  Cannot check database, will attempt seeding');
  }

  // Step 3: Seed database if needed
  if (needsSeeding) {
    console.log('\n📦 Step 3: Seeding database...');
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
      await dbManager.close();
      process.exit(1);
    }
  } else {
    console.log('\n✅ Step 3: Skipping seeding (database has data)');
  }

  // Step 4: Final verification
  console.log('\n✅ Step 4: Final verification...');
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM colleges');
    const count = parseInt(rows[0].count);
    console.log(`   ✅ Database has ${count} colleges`);

    if (count > 0) {
      const { rows: sample } = await pool.query('SELECT name FROM colleges LIMIT 3');
      console.log('   Sample colleges:');
      sample.forEach(c => console.log(`   - ${c.name}`));
    }
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    await dbManager.close();
    process.exit(1);
  }

  await dbManager.close();

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
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
