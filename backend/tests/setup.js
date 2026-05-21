const dbManager = require('../src/config/database');
const { createClient, runMigrations, seedCanonicalFixtures } = require('./helpers/testDb');

let testDbClient = null;

beforeAll(async () => {
  if (process.env.ENABLE_DB_TESTS !== 'true') return;
  try {
    testDbClient = await createClient();
    await runMigrations(testDbClient);
    await seedCanonicalFixtures(testDbClient);
  } catch (error) {
    console.warn('Database initialization failed:', error.message);
  }
});

afterAll(async () => {
  if (testDbClient) {
    try {
      await testDbClient.end();
    } catch (_) { /* noop */ }
  }
  try {
    await dbManager.close();
  } catch (_) { /* noop */ }
});
