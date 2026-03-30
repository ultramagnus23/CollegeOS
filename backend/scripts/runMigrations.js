// backend/scripts/runMigrations.js
// Standalone migration script that delegates to the PostgreSQL-based DatabaseManager.
// Usage: node scripts/runMigrations.js
// Requires DATABASE_URL env var (or defaults to postgresql://localhost:5432/college_app).

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dbManager = require('../src/config/database');

async function main() {
  console.log('\n🔄 Running PostgreSQL database migrations via DatabaseManager...\n');
  try {
    dbManager.initialize();
    await dbManager.runMigrations();
    console.log('\n✅ Migrations completed successfully.\n');
  } catch (err) {
    console.error('\n❌ Migration process failed:', err.message);
    process.exit(1);
  } finally {
    await dbManager.close();
  }
}

main();