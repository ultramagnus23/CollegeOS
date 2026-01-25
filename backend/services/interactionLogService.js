// backend/services/interactionLogService.js
// User interaction logging for future ML training data
// Currently just logs, doesn't train anything

const dbManager = require('../src/config/database');
const logger = require('../src/utils/logger');

/**
 * Interaction types that we track
 */
const INTERACTION_TYPES = {
  VIEW: 'view',           // College was viewed/expanded
  SAVE: 'save',           // College was saved/bookmarked
  UNSAVE: 'unsave',       // College was removed from saved
  CLICK: 'click',         // Click to external link (website, apply)
  APPLY: 'apply',         // User started application
  DISMISS: 'dismiss',     // User explicitly dismissed recommendation
  COMPARE: 'compare',     // Added to comparison list
  SHARE: 'share'          // Shared with someone
};

/**
 * Initialize the interaction logs table
 * Call this during app startup
 */
function initializeInteractionTable() {
  try {
    const db = dbManager.getDatabase();
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        college_id INTEGER NOT NULL,
        interaction_type TEXT NOT NULL,
        recommendation_score INTEGER,
        recommendation_category TEXT,
        context TEXT,
        source_page TEXT,
        session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_interactions_user ON user_interactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_interactions_college ON user_interactions(college_id);
      CREATE INDEX IF NOT EXISTS idx_interactions_type ON user_interactions(interaction_type);
      CREATE INDEX IF NOT EXISTS idx_interactions_created ON user_interactions(created_at);
    `);
    
    logger.info('User interactions table initialized');
    return true;
  } catch (error) {
    logger.error('Failed to initialize interactions table:', error);
    return false;
  }
}

/**
 * Log a user interaction
 * @param {Object} interaction - Interaction data
 * @returns {Object} Result with success status
 */
function logInteraction(interaction) {
  try {
    const {
      userId,
      collegeId,
      interactionType,
      recommendationScore = null,
      recommendationCategory = null,
      context = null,
      sourcePage = null,
      sessionId = null
    } = interaction;
    
    // Validate required fields
    if (!userId || !collegeId || !interactionType) {
      return {
        success: false,
        error: 'Missing required fields: userId, collegeId, interactionType'
      };
    }
    
    // Validate interaction type
    if (!Object.values(INTERACTION_TYPES).includes(interactionType)) {
      return {
        success: false,
        error: `Invalid interaction type. Must be one of: ${Object.values(INTERACTION_TYPES).join(', ')}`
      };
    }
    
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO user_interactions (
        user_id, college_id, interaction_type,
        recommendation_score, recommendation_category,
        context, source_page, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userId,
      collegeId,
      interactionType,
      recommendationScore,
      recommendationCategory,
      context ? JSON.stringify(context) : null,
      sourcePage,
      sessionId
    );
    
    logger.debug(`Logged interaction: user=${userId}, college=${collegeId}, type=${interactionType}`);
    
    return {
      success: true,
      interactionId: result.lastInsertRowid
    };
  } catch (error) {
    logger.error('Failed to log interaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Log a view interaction
 */
function logView(userId, collegeId, options = {}) {
  return logInteraction({
    userId,
    collegeId,
    interactionType: INTERACTION_TYPES.VIEW,
    ...options
  });
}

/**
 * Log a save interaction
 */
function logSave(userId, collegeId, options = {}) {
  return logInteraction({
    userId,
    collegeId,
    interactionType: INTERACTION_TYPES.SAVE,
    ...options
  });
}

/**
 * Log a click interaction
 */
function logClick(userId, collegeId, options = {}) {
  return logInteraction({
    userId,
    collegeId,
    interactionType: INTERACTION_TYPES.CLICK,
    ...options
  });
}

/**
 * Log an apply interaction
 */
function logApply(userId, collegeId, options = {}) {
  return logInteraction({
    userId,
    collegeId,
    interactionType: INTERACTION_TYPES.APPLY,
    ...options
  });
}

/**
 * Get interaction history for a user
 * @param {number} userId - User ID
 * @param {Object} options - Filter options
 * @returns {Array} Array of interactions
 */
function getUserInteractions(userId, options = {}) {
  try {
    const db = dbManager.getDatabase();
    
    let query = `
      SELECT ui.*, c.name as college_name, c.country, c.location
      FROM user_interactions ui
      LEFT JOIN colleges c ON ui.college_id = c.id
      WHERE ui.user_id = ?
    `;
    const params = [userId];
    
    if (options.interactionType) {
      query += ' AND ui.interaction_type = ?';
      params.push(options.interactionType);
    }
    
    if (options.collegeId) {
      query += ' AND ui.college_id = ?';
      params.push(options.collegeId);
    }
    
    if (options.since) {
      query += ' AND ui.created_at >= ?';
      params.push(options.since);
    }
    
    query += ' ORDER BY ui.created_at DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    const interactions = stmt.all(...params);
    
    // Parse context JSON
    return interactions.map(i => ({
      ...i,
      context: i.context ? JSON.parse(i.context) : null
    }));
  } catch (error) {
    logger.error('Failed to get user interactions:', error);
    return [];
  }
}

/**
 * Get interaction statistics for a user
 * Useful for understanding user behavior
 */
function getUserInteractionStats(userId) {
  try {
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT 
        interaction_type,
        COUNT(*) as count,
        COUNT(DISTINCT college_id) as unique_colleges
      FROM user_interactions
      WHERE user_id = ?
      GROUP BY interaction_type
    `);
    
    const stats = stmt.all(userId);
    
    // Also get most interacted colleges
    const topCollegesStmt = db.prepare(`
      SELECT 
        c.id,
        c.name,
        c.country,
        COUNT(*) as interaction_count,
        GROUP_CONCAT(DISTINCT ui.interaction_type) as interaction_types
      FROM user_interactions ui
      JOIN colleges c ON ui.college_id = c.id
      WHERE ui.user_id = ?
      GROUP BY c.id
      ORDER BY interaction_count DESC
      LIMIT 10
    `);
    
    const topColleges = topCollegesStmt.all(userId);
    
    return {
      success: true,
      byType: stats.reduce((acc, s) => {
        acc[s.interaction_type] = {
          count: s.count,
          uniqueColleges: s.unique_colleges
        };
        return acc;
      }, {}),
      topColleges
    };
  } catch (error) {
    logger.error('Failed to get interaction stats:', error);
    return {
      success: false,
      error: error.message,
      byType: {},
      topColleges: []
    };
  }
}

/**
 * Get saved colleges for a user
 */
function getSavedColleges(userId) {
  try {
    const db = dbManager.getDatabase();
    
    // Get colleges that were saved but not unsaved later
    const stmt = db.prepare(`
      SELECT DISTINCT c.*, 
        (SELECT MAX(created_at) FROM user_interactions 
         WHERE user_id = ? AND college_id = c.id AND interaction_type = 'save') as saved_at
      FROM colleges c
      WHERE c.id IN (
        SELECT college_id FROM user_interactions
        WHERE user_id = ? AND interaction_type = 'save'
        AND college_id NOT IN (
          SELECT college_id FROM user_interactions
          WHERE user_id = ? AND interaction_type = 'unsave'
          AND created_at > (
            SELECT MAX(created_at) FROM user_interactions
            WHERE user_id = ? AND college_id = user_interactions.college_id AND interaction_type = 'save'
          )
        )
      )
      ORDER BY saved_at DESC
    `);
    
    return stmt.all(userId, userId, userId, userId);
  } catch (error) {
    logger.error('Failed to get saved colleges:', error);
    return [];
  }
}

/**
 * Export interaction data for ML training (future use)
 * Returns data in a format suitable for training
 */
function exportInteractionsForTraining(options = {}) {
  try {
    const db = dbManager.getDatabase();
    
    let query = `
      SELECT 
        ui.user_id,
        ui.college_id,
        ui.interaction_type,
        ui.recommendation_score,
        ui.recommendation_category,
        ui.created_at,
        u.academic_board,
        u.percentage,
        u.gpa,
        u.intended_major,
        u.target_countries,
        c.country as college_country,
        c.acceptance_rate,
        c.programs as college_programs,
        c.tuition_cost
      FROM user_interactions ui
      JOIN users u ON ui.user_id = u.id
      JOIN colleges c ON ui.college_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (options.since) {
      query += ' AND ui.created_at >= ?';
      params.push(options.since);
    }
    
    if (options.interactionTypes) {
      query += ` AND ui.interaction_type IN (${options.interactionTypes.map(() => '?').join(',')})`;
      params.push(...options.interactionTypes);
    }
    
    query += ' ORDER BY ui.created_at ASC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (error) {
    logger.error('Failed to export interactions:', error);
    return [];
  }
}

module.exports = {
  INTERACTION_TYPES,
  initializeInteractionTable,
  logInteraction,
  logView,
  logSave,
  logClick,
  logApply,
  getUserInteractions,
  getUserInteractionStats,
  getSavedColleges,
  exportInteractionsForTraining
};
