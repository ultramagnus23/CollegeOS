const dbManager = require('../src/config/database');
const logger = require('../src/utils/logger');

logger.info('Starting database migrations...');

try {
  dbManager.initialize();
  dbManager.runMigrations();
  logger.info('Database migrations completed successfully');
  process.exit(0);
} catch (error) {
  logger.error('Migration failed:', error);
  process.exit(1);
}