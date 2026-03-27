const dbManager = require('../config/database');

class Essay {
  static async create(data) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `INSERT INTO essays (application_id, essay_type, prompt, word_limit, google_drive_link, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.applicationId, data.essayType, data.prompt,
        data.wordLimit || null, data.googleDriveLink || null,
        data.status || 'not_started', data.notes || null
      ]
    );
    return this.findById(rows[0].id);
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM essays WHERE id = $1', [id]);
    return rows[0] || null;
  }

  static async findByApplication(applicationId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      'SELECT * FROM essays WHERE application_id = $1 ORDER BY created_at ASC',
      [applicationId]
    );
    return rows;
  }

  static async findByUser(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT e.*, a.college_id, c.name as college_name
       FROM essays e
       JOIN applications a ON e.application_id = a.id
       JOIN colleges c ON a.college_id = c.id
       WHERE a.user_id = $1
       ORDER BY e.created_at DESC`,
      [userId]
    );
    return rows;
  }

  static async update(id, data) {
    const pool = dbManager.getDatabase();
    const updates = [];
    const params = [];
    let idx = 1;

    if (data.googleDriveLink !== undefined) {
      updates.push(`google_drive_link = $${idx++}`);
      params.push(data.googleDriveLink);
      updates.push(`last_edited_at = NOW()`);
    }
    if (data.status) { updates.push(`status = $${idx++}`); params.push(data.status); }
    if (data.notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(data.notes); }

    params.push(id);
    await pool.query(`UPDATE essays SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    return this.findById(id);
  }

  static async delete(id) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM essays WHERE id = $1', [id]);
    return { changes: rowCount };
  }
}

module.exports = Essay;
