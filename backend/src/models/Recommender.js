/**
 * Recommender Model
 * Manage teacher/counselor recommendations for applications
 */
const dbManager = require('../config/database');

class Recommender {
  // Recommender types
  static TYPES = {
    TEACHER: 'teacher',
    COUNSELOR: 'counselor',
    MENTOR: 'mentor',
    EMPLOYER: 'employer',
    OTHER: 'other'
  };

  // Request status
  static STATUS = {
    NOT_REQUESTED: 'not_requested',
    REQUESTED: 'requested',
    IN_PROGRESS: 'in_progress',
    SUBMITTED: 'submitted',
    DECLINED: 'declined'
  };

  /**
   * Create recommenders table if not exists
   */
  static ensureTable() {
    const db = dbManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS recommenders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        type TEXT NOT NULL,
        relationship TEXT,
        subject TEXT,
        institution TEXT,
        years_known INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_recommenders_user ON recommenders(user_id);
      CREATE INDEX IF NOT EXISTS idx_recommenders_type ON recommenders(type);
    `);
    
    // Recommendation requests table (links recommenders to colleges)
    db.exec(`
      CREATE TABLE IF NOT EXISTS recommendation_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        recommender_id INTEGER NOT NULL,
        college_id INTEGER,
        college_name TEXT,
        application_system TEXT,
        status TEXT DEFAULT 'not_requested',
        request_date DATE,
        deadline DATE,
        submitted_date DATE,
        reminder_sent INTEGER DEFAULT 0,
        last_reminder_date DATE,
        thank_you_sent INTEGER DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recommender_id) REFERENCES recommenders(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_rec_requests_user ON recommendation_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_rec_requests_status ON recommendation_requests(status);
      CREATE INDEX IF NOT EXISTS idx_rec_requests_deadline ON recommendation_requests(deadline);
    `);
  }

  /**
   * Get all recommenders for a user
   */
  static getByUserId(userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT r.*, 
        (SELECT COUNT(*) FROM recommendation_requests rr WHERE rr.recommender_id = r.id AND rr.status = 'submitted') as letters_submitted,
        (SELECT COUNT(*) FROM recommendation_requests rr WHERE rr.recommender_id = r.id) as total_requests
      FROM recommenders r
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `);
    
    return stmt.all(userId);
  }

  /**
   * Get recommender by ID
   */
  static getById(id, userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM recommenders WHERE id = ? AND user_id = ?');
    return stmt.get(id, userId);
  }

  /**
   * Create a new recommender
   */
  static create(userId, data) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const {
      name,
      email,
      phone,
      type,
      relationship,
      subject,
      institution,
      yearsKnown,
      notes
    } = data;
    
    const stmt = db.prepare(`
      INSERT INTO recommenders (
        user_id, name, email, phone, type, relationship, subject, institution, years_known, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(userId, name, email, phone, type, relationship, subject, institution, yearsKnown, notes);
    return this.getById(result.lastInsertRowid, userId);
  }

  /**
   * Update recommender
   */
  static update(id, userId, updates) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const allowedFields = [
      'name', 'email', 'phone', 'type', 'relationship', 'subject', 'institution', 'years_known', 'notes'
    ];
    
    const setClause = [];
    const params = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClause.push(`${snakeKey} = ?`);
        params.push(value);
      }
    }
    
    if (setClause.length === 0) return null;
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, userId);
    
    const stmt = db.prepare(`
      UPDATE recommenders SET ${setClause.join(', ')} WHERE id = ? AND user_id = ?
    `);
    
    stmt.run(...params);
    return this.getById(id, userId);
  }

  /**
   * Delete recommender
   */
  static delete(id, userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    const stmt = db.prepare('DELETE FROM recommenders WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  // ==========================================
  // RECOMMENDATION REQUESTS
  // ==========================================

  /**
   * Get all recommendation requests for a user
   */
  static getRequests(userId, filters = {}) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    let query = `
      SELECT rr.*, r.name as recommender_name, r.email as recommender_email, r.type as recommender_type
      FROM recommendation_requests rr
      JOIN recommenders r ON rr.recommender_id = r.id
      WHERE rr.user_id = ?
    `;
    const params = [userId];
    
    if (filters.status) {
      query += ' AND rr.status = ?';
      params.push(filters.status);
    }
    
    if (filters.recommenderId) {
      query += ' AND rr.recommender_id = ?';
      params.push(filters.recommenderId);
    }
    
    if (filters.collegeId) {
      query += ' AND rr.college_id = ?';
      params.push(filters.collegeId);
    }
    
    query += ' ORDER BY rr.deadline ASC NULLS LAST, rr.created_at DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get request by ID
   */
  static getRequestById(id, userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT rr.*, r.name as recommender_name, r.email as recommender_email
      FROM recommendation_requests rr
      JOIN recommenders r ON rr.recommender_id = r.id
      WHERE rr.id = ? AND rr.user_id = ?
    `);
    
    return stmt.get(id, userId);
  }

  /**
   * Create recommendation request
   */
  static createRequest(userId, data) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const {
      recommenderId,
      collegeId,
      collegeName,
      applicationSystem,
      status = 'not_requested',
      requestDate,
      deadline,
      notes
    } = data;
    
    const stmt = db.prepare(`
      INSERT INTO recommendation_requests (
        user_id, recommender_id, college_id, college_name, application_system,
        status, request_date, deadline, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userId, recommenderId, collegeId, collegeName, applicationSystem,
      status, requestDate, deadline, notes
    );
    
    return this.getRequestById(result.lastInsertRowid, userId);
  }

  /**
   * Update recommendation request
   */
  static updateRequest(id, userId, updates) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const allowedFields = [
      'status', 'request_date', 'deadline', 'submitted_date', 
      'reminder_sent', 'last_reminder_date', 'thank_you_sent', 'notes'
    ];
    
    const setClause = [];
    const params = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClause.push(`${snakeKey} = ?`);
        params.push(value);
      }
    }
    
    if (setClause.length === 0) return null;
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, userId);
    
    const stmt = db.prepare(`
      UPDATE recommendation_requests SET ${setClause.join(', ')} WHERE id = ? AND user_id = ?
    `);
    
    stmt.run(...params);
    return this.getRequestById(id, userId);
  }

  /**
   * Delete recommendation request
   */
  static deleteRequest(id, userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    const stmt = db.prepare('DELETE FROM recommendation_requests WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Get pending reminders (requests that need follow-up)
   */
  static getPendingReminders(userId, daysSinceRequest = 7) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT rr.*, r.name as recommender_name, r.email as recommender_email
      FROM recommendation_requests rr
      JOIN recommenders r ON rr.recommender_id = r.id
      WHERE rr.user_id = ?
        AND rr.status IN ('requested', 'in_progress')
        AND (
          rr.last_reminder_date IS NULL 
          OR date(rr.last_reminder_date, '+' || ? || ' days') <= date('now')
        )
      ORDER BY rr.deadline ASC
    `);
    
    return stmt.all(userId, daysSinceRequest);
  }

  /**
   * Get overdue requests
   */
  static getOverdueRequests(userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT rr.*, r.name as recommender_name, r.email as recommender_email
      FROM recommendation_requests rr
      JOIN recommenders r ON rr.recommender_id = r.id
      WHERE rr.user_id = ?
        AND rr.deadline < date('now')
        AND rr.status NOT IN ('submitted', 'declined')
      ORDER BY rr.deadline ASC
    `);
    
    return stmt.all(userId);
  }

  /**
   * Get summary statistics
   */
  static getSummary(userId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'not_requested' THEN 1 ELSE 0 END) as not_requested,
        SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END) as requested,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
        SUM(CASE WHEN deadline < date('now') AND status NOT IN ('submitted', 'declined') THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN thank_you_sent = 0 AND status = 'submitted' THEN 1 ELSE 0 END) as needs_thank_you
      FROM recommendation_requests
      WHERE user_id = ?
    `);
    
    return stmt.get(userId);
  }

  /**
   * Generate email template
   */
  static generateEmailTemplate(type, data) {
    const templates = {
      request: `
Dear ${data.recommenderName},

I hope this email finds you well. I am writing to kindly request a letter of recommendation for my college application to ${data.collegeName || 'several universities'}.

I have greatly valued your guidance in ${data.subject || 'your class'}, and I believe your perspective on my academic abilities and personal growth would be invaluable to my application.

The deadline for submission is ${data.deadline || 'approaching soon'}. I would be happy to provide any additional information you might need.

Thank you for considering this request.

Best regards,
${data.studentName}
      `.trim(),
      
      reminder: `
Dear ${data.recommenderName},

I hope you are doing well. I wanted to follow up on my previous request for a letter of recommendation for ${data.collegeName || 'my college applications'}.

The deadline is ${data.deadline || 'approaching soon'}, and I wanted to ensure you have everything you need. Please let me know if I can provide any additional information.

Thank you so much for your support.

Best regards,
${data.studentName}
      `.trim(),
      
      thank_you: `
Dear ${data.recommenderName},

I wanted to express my sincere gratitude for taking the time to write a letter of recommendation for my college application to ${data.collegeName || 'my selected universities'}.

Your support means a great deal to me, and I truly appreciate your kind words and the time you invested in helping me pursue my goals.

I will keep you updated on my application results.

With gratitude,
${data.studentName}
      `.trim()
    };
    
    return templates[type] || '';
  }
}

module.exports = Recommender;
