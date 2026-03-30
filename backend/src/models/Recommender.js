const dbManager = require('../config/database');

class Recommender {
  static TYPES = { TEACHER:'teacher', COUNSELOR:'counselor', MENTOR:'mentor', EMPLOYER:'employer', OTHER:'other' };
  static STATUS = { NOT_REQUESTED:'not_requested', REQUESTED:'requested', IN_PROGRESS:'in_progress', SUBMITTED:'submitted', DECLINED:'declined' };

  static async getByUserId(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM recommendation_requests rr WHERE rr.recommender_id=r.id AND rr.status='submitted') as letters_submitted,
        (SELECT COUNT(*) FROM recommendation_requests rr WHERE rr.recommender_id=r.id) as total_requests
       FROM recommenders r WHERE r.user_id=$1 ORDER BY r.created_at DESC`,
      [userId]
    );
    return rows;
  }

  static async getById(id, userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM recommenders WHERE id=$1 AND user_id=$2', [id, userId]);
    return rows[0] || null;
  }

  static async create(userId, data) {
    const pool = dbManager.getDatabase();
    const { name, email, phone, type, relationship, subject, institution, yearsKnown, notes } = data;
    const { rows } = await pool.query(
      `INSERT INTO recommenders (user_id,name,email,phone,type,relationship,subject,institution,years_known,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [userId, name, email||null, phone||null, type, relationship||null, subject||null, institution||null, yearsKnown||null, notes||null]
    );
    return this.getById(rows[0].id, userId);
  }

  static async update(id, userId, updates) {
    const pool = dbManager.getDatabase();
    const allowed = ['name','email','phone','type','relationship','subject','institution','years_known','notes'];
    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(snakeKey)) { setClauses.push(`${snakeKey}=$${idx++}`); params.push(value); }
    }
    if (setClauses.length === 0) return null;
    setClauses.push('updated_at=NOW()');
    params.push(id, userId);
    await pool.query(`UPDATE recommenders SET ${setClauses.join(',')} WHERE id=$${idx++} AND user_id=$${idx}`, params);
    return this.getById(id, userId);
  }

  static async delete(id, userId) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM recommenders WHERE id=$1 AND user_id=$2', [id, userId]);
    return rowCount > 0;
  }

  static async getRequests(userId, filters = {}) {
    const pool = dbManager.getDatabase();
    let query = `SELECT rr.*, r.name as recommender_name, r.email as recommender_email, r.type as recommender_type
                 FROM recommendation_requests rr JOIN recommenders r ON rr.recommender_id=r.id WHERE rr.user_id=$1`;
    const params = [userId];
    let idx = 2;
    if (filters.status) { query += ` AND rr.status=$${idx++}`; params.push(filters.status); }
    if (filters.recommenderId) { query += ` AND rr.recommender_id=$${idx++}`; params.push(filters.recommenderId); }
    if (filters.collegeId) { query += ` AND rr.college_id=$${idx++}`; params.push(filters.collegeId); }
    query += ' ORDER BY CASE WHEN rr.deadline IS NULL THEN 1 ELSE 0 END, rr.deadline ASC, rr.created_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async getRequestById(id, userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT rr.*, r.name as recommender_name, r.email as recommender_email
       FROM recommendation_requests rr JOIN recommenders r ON rr.recommender_id=r.id
       WHERE rr.id=$1 AND rr.user_id=$2`,
      [id, userId]
    );
    return rows[0] || null;
  }

  static async createRequest(userId, data) {
    const pool = dbManager.getDatabase();
    const { recommenderId, collegeId, collegeName, applicationSystem, status='not_requested', requestDate, deadline, notes } = data;
    const { rows } = await pool.query(
      `INSERT INTO recommendation_requests (user_id,recommender_id,college_id,college_name,application_system,status,request_date,deadline,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [userId, recommenderId, collegeId||null, collegeName||null, applicationSystem||null, status, requestDate||null, deadline||null, notes||null]
    );
    return this.getRequestById(rows[0].id, userId);
  }

  static async updateRequest(id, userId, updates) {
    const pool = dbManager.getDatabase();
    const allowed = ['status','request_date','deadline','submitted_date','reminder_sent','last_reminder_date','thank_you_sent','notes'];
    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(snakeKey)) { setClauses.push(`${snakeKey}=$${idx++}`); params.push(value); }
    }
    if (setClauses.length === 0) return null;
    setClauses.push('updated_at=NOW()');
    params.push(id, userId);
    await pool.query(`UPDATE recommendation_requests SET ${setClauses.join(',')} WHERE id=$${idx++} AND user_id=$${idx}`, params);
    return this.getRequestById(id, userId);
  }

  static async deleteRequest(id, userId) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM recommendation_requests WHERE id=$1 AND user_id=$2', [id, userId]);
    return rowCount > 0;
  }

  static async getSummary(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT COUNT(*) as total_requests,
        SUM(CASE WHEN status='not_requested' THEN 1 ELSE 0 END) as not_requested,
        SUM(CASE WHEN status='requested' THEN 1 ELSE 0 END) as requested,
        SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) as declined,
        SUM(CASE WHEN deadline < CURRENT_DATE AND status NOT IN ('submitted','declined') THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN thank_you_sent=FALSE AND status='submitted' THEN 1 ELSE 0 END) as needs_thank_you
       FROM recommendation_requests WHERE user_id=$1`,
      [userId]
    );
    return rows[0];
  }

  static generateEmailTemplate(type, data) {
    const templates = {
      request: `Dear ${data.recommenderName},\n\nI am writing to kindly request a letter of recommendation for my college application to ${data.collegeName||'several universities'}.\n\nThe deadline for submission is ${data.deadline||'approaching soon'}.\n\nThank you,\n${data.studentName}`,
      reminder: `Dear ${data.recommenderName},\n\nI wanted to follow up on my previous request for a letter of recommendation. The deadline is ${data.deadline||'approaching soon'}.\n\nThank you,\n${data.studentName}`,
      thank_you: `Dear ${data.recommenderName},\n\nI wanted to sincerely thank you for your letter of recommendation for ${data.collegeName||'my applications'}.\n\nWith gratitude,\n${data.studentName}`
    };
    return templates[type] || '';
  }
}
module.exports = Recommender;
