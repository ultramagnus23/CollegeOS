const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const logger = require('../utils/logger');
const config = require('./env');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initialized = false;
  }
  
  initialize() {
    if (this.initialized) return this.db;
    
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(config.database.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Connect to database
      this.db = new Database(config.database.path, {
        verbose: config.nodeEnv === 'development' ? logger.debug : null
      });
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      // Performance optimizations
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      
      logger.info('Database connected successfully');
      this.initialized = true;
      
      return this.db;
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }
  
    runMigrations() {
      this.initialize();
      
      logger.info('Running database migrations via external script...');
      
      // Call the external migration script as the single source of truth
      // This consolidates all migrations into the SQL files in backend/migrations/
      const migrationScript = path.join(__dirname, '../../scripts/runMigrations.js');
      
      try {
        // Run migrations synchronously and capture output
        const output = execSync(`node "${migrationScript}"`, {
          cwd: path.join(__dirname, '../..'),
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        // Log migration output
        if (output) {
          logger.info('Migration output:\n' + output);
        }
        
        logger.info('Database migrations completed successfully');
      } catch (error) {
        // Consolidate error information for better debugging
        const errorDetails = [
          `Database migration failed: ${error.message}`,
          error.stdout ? `\nMigration output:\n${error.stdout}` : '',
          error.stderr ? `\nMigration errors:\n${error.stderr}` : '',
          '\n\n💡 Troubleshooting:',
          '   1. Check backend/migrations/ directory for SQL syntax errors',
          '   2. Ensure all previous migrations completed successfully',
          '   3. Try running: ./backend/fresh-start.sh to reset database',
          '   4. See docs/TROUBLESHOOTING.md for more help'
        ].filter(Boolean).join('');
        
        logger.error(errorDetails);
        throw new Error(`Migration failed. ${error.message}`);
      }
    }
  
  getDatabase() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.db;
  }
  
  close() {
    if (this.db) {
      this.db.close();
      this.initialized = false;
      logger.info('Database connection closed');
    }
  }
}

// Singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;