const dbManager = require('../config/database');

class Deadline {
  static async create(data) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `INSERT INTO deadlines (application_id, deadline_type, deadline_date, description, source_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [data.applicationId, data.deadlineType, data.deadlineDate, data.description || null, data.sourceUrl || null]
    );
    return this.findById(rows[0].id);
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM deadlines WHERE id = $1', [id]);
    return rows[0] || null;
  }

  static async findByApplication(applicationId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      'SELECT * FROM deadlines WHERE application_id = $1 ORDER BY deadline_date ASC',
      [applicationId]
    );
    return rows;
  }

  static async findUpcoming(userId, daysAhead = 30) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT d.*, a.college_id, c.name as college_name
       FROM deadlines d
       JOIN applications a ON d.application_id = a.id
       JOIN colleges c ON a.college_id = c.id
       WHERE a.user_id = $1
         AND (d.is_completed IS NULL OR d.is_completed = false)
         AND d.deadline_date BETWEEN NOW() AND NOW() + ($2 || ' days')::INTERVAL
       ORDER BY d.deadline_date ASC`,
      [userId, daysAhead]
    );
    return rows;
  }

  static async update(id, data) {
    const pool = dbManager.getDatabase();
    const updates = [];
    const params = [];
    let idx = 1;

    if (data.deadlineDate) { updates.push(`deadline_date = $${idx++}`); params.push(data.deadlineDate); }
    if (data.description !== undefined) { updates.push(`description = $${idx++}`); params.push(data.description); }
    if (data.isCompleted !== undefined) {
      updates.push(`is_completed = $${idx++}`);
      params.push(!!data.isCompleted);
      if (data.isCompleted) updates.push(`completed_at = NOW()`);
    }

    params.push(id);
    await pool.query(`UPDATE deadlines SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    return this.findById(id);
  }

  static async delete(id) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM deadlines WHERE id = $1', [id]);
    return { changes: rowCount };
  }
}

module.exports = Deadline;
