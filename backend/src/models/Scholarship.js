const dbManager = require('../config/database');

class Scholarship {
  static _parse(s) {
    if (!s) return null;
    return {
      ...s,
      nationality_requirements: s.nationality_requirements ? (typeof s.nationality_requirements === 'object' ? s.nationality_requirements : JSON.parse(s.nationality_requirements)) : [],
      academic_requirements: s.academic_requirements ? (typeof s.academic_requirements === 'object' ? s.academic_requirements : JSON.parse(s.academic_requirements)) : [],
      major_requirements: s.major_requirements ? (typeof s.major_requirements === 'object' ? s.major_requirements : JSON.parse(s.major_requirements)) : [],
      demographic_requirements: s.demographic_requirements ? (typeof s.demographic_requirements === 'object' ? s.demographic_requirements : JSON.parse(s.demographic_requirements)) : [],
      documentation_required: s.documentation_required ? (typeof s.documentation_required === 'object' ? s.documentation_required : JSON.parse(s.documentation_required)) : [],
    };
  }

  static async search(filters = {}) {
    const pool = dbManager.getDatabase();
    let query = `SELECT * FROM scholarships WHERE status='active'`;
    const params = [];
    let idx = 1;
    if (filters.country) { query += ` AND (country=$${idx++} OR country='International')`; params.push(filters.country); }
    if (filters.needBased !== undefined) { query += ` AND need_based=$${idx++}`; params.push(filters.needBased ? true : false); }
    if (filters.meritBased !== undefined) { query += ` AND merit_based=$${idx++}`; params.push(filters.meritBased ? true : false); }
    if (filters.minAmount) { query += ` AND amount_min>=$${idx++}`; params.push(filters.minAmount); }
    if (filters.maxAmount) { query += ` AND amount_max<=$${idx++}`; params.push(filters.maxAmount); }
    if (filters.major) { query += ` AND major_requirements ILIKE $${idx++}`; params.push(`%${filters.major}%`); }
    if (filters.deadline) { query += ` AND deadline>=$${idx++}`; params.push(filters.deadline); }
    if (filters.search) { query += ` AND (name ILIKE $${idx} OR description ILIKE $${idx} OR provider ILIKE $${idx})`; params.push(`%${filters.search}%`); idx++; }
    const limit = Math.min(filters.limit || 50, 200);
    const offset = filters.offset || 0;
    query += ` ORDER BY deadline ASC NULLS LAST, amount_max DESC NULLS LAST LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const { rows } = await pool.query(query, params);
    return rows.map(this._parse.bind(this));
  }

  static async getById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM scholarships WHERE id=$1', [id]);
    return this._parse(rows[0]);
  }

  static async trackForUser(userId, scholarshipId, status = 'interested', notes = '') {
    const pool = dbManager.getDatabase();
    await pool.query(
      `INSERT INTO user_scholarships (user_id,scholarship_id,status,notes) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id,scholarship_id) DO UPDATE SET status=EXCLUDED.status, notes=EXCLUDED.notes, updated_at=NOW()`,
      [userId, scholarshipId, status, notes]
    );
    return this.getUserScholarship(userId, scholarshipId);
  }

  static async getUserScholarships(userId, status = null) {
    const pool = dbManager.getDatabase();
    let query = `SELECT us.*, s.name, s.provider, s.country, s.amount, s.amount_min, s.amount_max, s.currency, s.deadline, s.description, s.application_url
                 FROM user_scholarships us JOIN scholarships s ON us.scholarship_id=s.id WHERE us.user_id=$1`;
    const params = [userId];
    if (status) { query += ` AND us.status=$2`; params.push(status); }
    query += ' ORDER BY us.updated_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  }

  static async getUserScholarship(userId, scholarshipId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT us.*, s.name, s.provider FROM user_scholarships us JOIN scholarships s ON us.scholarship_id=s.id WHERE us.user_id=$1 AND us.scholarship_id=$2`,
      [userId, scholarshipId]
    );
    return rows[0] || null;
  }

  static async updateUserScholarship(userId, scholarshipId, updates) {
    const pool = dbManager.getDatabase();
    const allowed = ['status','notes','application_date','decision_date','award_amount'];
    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(snakeKey)) { setClauses.push(`${snakeKey}=$${idx++}`); params.push(value); }
    }
    if (setClauses.length === 0) return this.getUserScholarship(userId, scholarshipId);
    setClauses.push('updated_at=NOW()');
    params.push(userId, scholarshipId);
    await pool.query(`UPDATE user_scholarships SET ${setClauses.join(',')} WHERE user_id=$${idx++} AND scholarship_id=$${idx}`, params);
    return this.getUserScholarship(userId, scholarshipId);
  }

  static async getEligibleScholarships(userProfile) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(`SELECT * FROM scholarships WHERE status='active' ORDER BY deadline ASC NULLS LAST`);
    return rows.map(this._parse.bind(this)).filter(s => {
      if (s.nationality_requirements && s.nationality_requirements.length > 0) {
        const nr = s.nationality_requirements.map(r => r.toLowerCase());
        if (!nr.includes('all') && !nr.includes(userProfile.citizenship || '')) return false;
      }
      return true;
    });
  }

  static async getCountries() {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(`SELECT DISTINCT country FROM scholarships WHERE status='active' ORDER BY country`);
    return rows.map(r => r.country);
  }
}
module.exports = Scholarship;
