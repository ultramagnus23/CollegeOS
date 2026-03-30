const dbManager = require('../config/database');

class Document {
  static CATEGORIES = {
    TRANSCRIPT:'transcript', TEST_SCORE:'test_score', ESSAY:'essay',
    RECOMMENDATION:'recommendation', FINANCIAL:'financial', PROOF:'proof',
    PASSPORT:'passport', PORTFOLIO:'portfolio', OTHER:'other'
  };
  static STATUS = {
    PENDING:'pending', UPLOADED:'uploaded', VERIFIED:'verified',
    EXPIRED:'expired', REJECTED:'rejected'
  };

  static _parse(doc) {
    if (!doc) return null;
    return {
      ...doc,
      tags: doc.tags ? (typeof doc.tags === 'object' ? doc.tags : JSON.parse(doc.tags)) : [],
      college_ids: doc.college_ids ? (typeof doc.college_ids === 'object' ? doc.college_ids : JSON.parse(doc.college_ids)) : [],
      metadata: doc.metadata ? (typeof doc.metadata === 'object' ? doc.metadata : JSON.parse(doc.metadata)) : {}
    };
  }

  static async getByUserId(userId, filters = {}) {
    const pool = dbManager.getDatabase();
    let query = 'SELECT * FROM documents WHERE user_id = $1';
    const params = [userId];
    let idx = 2;
    if (filters.category) { query += ` AND category = $${idx++}`; params.push(filters.category); }
    if (filters.status) { query += ` AND status = $${idx++}`; params.push(filters.status); }
    if (filters.collegeId) { query += ` AND college_ids LIKE $${idx++}`; params.push(`%${filters.collegeId}%`); }
    query += ' ORDER BY created_at DESC';
    if (filters.limit) { query += ` LIMIT $${idx++}`; params.push(filters.limit); }
    const { rows } = await pool.query(query, params);
    return rows.map(this._parse.bind(this));
  }

  static async getById(id, userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    return this._parse(rows[0]);
  }

  static async create(userId, data) {
    const pool = dbManager.getDatabase();
    const { name, category, fileType, fileSize, filePath, fileUrl, description,
            status = 'pending', expiryDate, tags = [], collegeIds = [], metadata = {} } = data;
    const { rows } = await pool.query(
      `INSERT INTO documents (user_id, name, category, file_type, file_size, file_path, file_url,
        description, status, expiry_date, tags, college_ids, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [userId, name, category, fileType, fileSize, filePath, fileUrl,
       description, status, expiryDate||null, JSON.stringify(tags), JSON.stringify(collegeIds), JSON.stringify(metadata)]
    );
    return this.getById(rows[0].id, userId);
  }

  static async update(id, userId, updates) {
    const pool = dbManager.getDatabase();
    const allowed = ['name','category','file_type','file_size','file_path','file_url','description','status','expiry_date','tags','college_ids','metadata'];
    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${idx++}`);
        params.push(['tags','college_ids','metadata'].includes(snakeKey) ? JSON.stringify(value) : value);
      }
    }
    if (setClauses.length === 0) return this.getById(id, userId);
    setClauses.push('updated_at = NOW()');
    params.push(id, userId);
    await pool.query(`UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`, params);
    return this.getById(id, userId);
  }

  static async delete(id, userId) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    return rowCount > 0;
  }

  static async getCategorySummary(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT category, COUNT(*) as count,
        SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) as verified_count,
        SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) as expired_count
       FROM documents WHERE user_id = $1 GROUP BY category`,
      [userId]
    );
    return rows;
  }

  static async getExpiringDocuments(userId, daysAhead = 30) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT * FROM documents
       WHERE user_id = $1 AND expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
         AND expiry_date >= CURRENT_DATE AND status != 'expired'
       ORDER BY expiry_date ASC`,
      [userId, daysAhead]
    );
    return rows.map(this._parse.bind(this));
  }

  static async checkRequiredDocuments(userId, collegeId, requiredCategories) {
    const pool = dbManager.getDatabase();
    const results = {};
    for (const category of requiredCategories) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) as count FROM documents
         WHERE user_id=$1 AND category=$2
           AND (college_ids LIKE $3 OR college_ids='[]')
           AND status IN ('uploaded','verified')`,
        [userId, category, `%${collegeId}%`]
      );
      results[category] = parseInt(rows[0].count) > 0;
    }
    return results;
  }
}
module.exports = Document;
