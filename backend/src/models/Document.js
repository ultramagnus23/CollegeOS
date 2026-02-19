/**
 * Document Model for Document Vault
 * Central storage for all application documents
 */
const dbManager = require('../config/database');

class Document {
  // Document categories
  static CATEGORIES = {
    TRANSCRIPT: 'transcript',
    TEST_SCORE: 'test_score',
    ESSAY: 'essay',
    RECOMMENDATION: 'recommendation',
    FINANCIAL: 'financial',
    PROOF: 'proof',
    PASSPORT: 'passport',
    PORTFOLIO: 'portfolio',
    OTHER: 'other'
  };

  // Document status
  static STATUS = {
    PENDING: 'pending',
    UPLOADED: 'uploaded',
    VERIFIED: 'verified',
    EXPIRED: 'expired',
    REJECTED: 'rejected'
  };

  /**
   * Create documents table if not exists
   */
  static ensureTable() {
    const db = dbManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        file_path TEXT,
        file_url TEXT,
        description TEXT,
        status TEXT DEFAULT 'pending',
        expiry_date DATE,
        tags TEXT,
        college_ids TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    `);
  }

  /**
   * Get all documents for a user
   */
  static getByUserId(userId, filters = {}) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    let query = 'SELECT * FROM documents WHERE user_id = ?';
    const params = [userId];
    
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.collegeId) {
      query += ' AND college_ids LIKE ?';
      params.push(`%${filters.collegeId}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = db.prepare(query);
    const documents = stmt.all(...params);
    
    return documents.map(doc => ({
      ...doc,
      tags: doc.tags ? JSON.parse(doc.tags) : [],
      college_ids: doc.college_ids ? JSON.parse(doc.college_ids) : [],
      metadata: doc.metadata ? JSON.parse(doc.metadata) : {}
    }));
  }

  /**
   * Get document by ID
   */
  static getById(id, userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?');
    const doc = stmt.get(id, userId);
    
    if (doc) {
      return {
        ...doc,
        tags: doc.tags ? JSON.parse(doc.tags) : [],
        college_ids: doc.college_ids ? JSON.parse(doc.college_ids) : [],
        metadata: doc.metadata ? JSON.parse(doc.metadata) : {}
      };
    }
    return null;
  }

  /**
   * Create a new document record
   */
  static create(userId, documentData) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const {
      name,
      category,
      fileType,
      fileSize,
      filePath,
      fileUrl,
      description,
      status = 'pending',
      expiryDate,
      tags = [],
      collegeIds = [],
      metadata = {}
    } = documentData;
    
    const stmt = db.prepare(`
      INSERT INTO documents (
        user_id, name, category, file_type, file_size, file_path, file_url,
        description, status, expiry_date, tags, college_ids, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userId,
      name,
      category,
      fileType,
      fileSize,
      filePath,
      fileUrl,
      description,
      status,
      expiryDate,
      JSON.stringify(tags),
      JSON.stringify(collegeIds),
      JSON.stringify(metadata)
    );
    
    return this.getById(result.lastInsertRowid, userId);
  }

  /**
   * Update document
   */
  static update(id, userId, updates) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const allowedFields = [
      'name', 'category', 'file_type', 'file_size', 'file_path', 'file_url',
      'description', 'status', 'expiry_date', 'tags', 'college_ids', 'metadata'
    ];
    
    const setClause = [];
    const params = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClause.push(`${snakeKey} = ?`);
        if (['tags', 'college_ids', 'metadata'].includes(snakeKey)) {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }
      }
    }
    
    if (setClause.length === 0) return null;
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, userId);
    
    const stmt = db.prepare(`
      UPDATE documents SET ${setClause.join(', ')} WHERE id = ? AND user_id = ?
    `);
    
    stmt.run(...params);
    return this.getById(id, userId);
  }

  /**
   * Delete document
   */
  static delete(id, userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    const stmt = db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Tag document to colleges
   */
  static tagToColleges(id, userId, collegeIds) {
    return this.update(id, userId, { collegeIds });
  }

  /**
   * Get documents by category summary
   */
  static getCategorySummary(userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified_count,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_count
      FROM documents
      WHERE user_id = ?
      GROUP BY category
    `);
    
    return stmt.all(userId);
  }

  /**
   * Get expiring documents
   */
  static getExpiringDocuments(userId, daysAhead = 30) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT * FROM documents
      WHERE user_id = ?
        AND expiry_date IS NOT NULL
        AND expiry_date <= date('now', '+' || ? || ' days')
        AND expiry_date >= date('now')
        AND status != 'expired'
      ORDER BY expiry_date ASC
    `);
    
    return stmt.all(userId, daysAhead);
  }

  /**
   * Check required documents for a college
   */
  static checkRequiredDocuments(userId, collegeId, requiredCategories) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const results = {};
    
    for (const category of requiredCategories) {
      const stmt = db.prepare(`
        SELECT COUNT(*) as count FROM documents
        WHERE user_id = ?
          AND category = ?
          AND (college_ids LIKE ? OR college_ids = '[]')
          AND status IN ('uploaded', 'verified')
      `);
      
      const result = stmt.get(userId, category, `%${collegeId}%`);
      results[category] = result.count > 0;
    }
    
    return results;
  }
}

module.exports = Document;
