// Test setup - gracefully handle database initialization
let dbManager;

try {
  dbManager = require('../src/config/database');
} catch (error) {
  console.warn('Database module not available for tests:', error.message);
  dbManager = null;
}

beforeAll(() => {
  if (dbManager) {
    // Initialize test database
    process.env.DATABASE_PATH = ':memory:'; // Use in-memory database for tests
    try {
      dbManager.initialize();
      dbManager.runMigrations();
    } catch (error) {
      console.warn('Database initialization failed:', error.message);
    }
  }
});

afterAll(() => {
  // Clean up
  if (dbManager) {
    try {
      dbManager.close();
    } catch (error) {
      // Ignore cleanup errors
    }
  }
});