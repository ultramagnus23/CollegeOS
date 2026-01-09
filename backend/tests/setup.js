const dbManager = require('../src/config/database');

beforeAll(() => {
  // Initialize test database
  process.env.DATABASE_PATH = ':memory:'; // Use in-memory database for tests
  dbManager.initialize();
  dbManager.runMigrations();
});

afterAll(() => {
  // Clean up
  dbManager.close();
});