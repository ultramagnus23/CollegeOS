const dbManager = require('../config/database');

class Essay {
  static create(data) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO essays (
        application_id, essay_type, prompt, word_limit,
        google_drive_link, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      data.applicationId,
      data.essayType,
      data.prompt,
      data.wordLimit || null,
      data.googleDriveLink || null,
      data.status || 'not_started',
      data.notes || null
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM essays WHERE id = ?');
    return stmt.get(id);
  }
  
  static findByApplication(applicationId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM essays 
      WHERE application_id = ? 
      ORDER BY created_at ASC
    `);
    return stmt.all(applicationId);
  }
  
  static findByUser(userId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT e.*, a.college_id, c.name as college_name
      FROM essays e
      JOIN applications a ON e.application_id = a.id
      JOIN colleges c ON a.college_id = c.id
      WHERE a.user_id = ?
      ORDER BY e.created_at DESC
    `);
    return stmt.all(userId);
  }
  
  static update(id, data) {
    const db = dbManager.getDatabase();
    const updates = [];
    const params = [];
    
    if (data.googleDriveLink !== undefined) {
      updates.push('google_drive_link = ?');
      params.push(data.googleDriveLink);
      updates.push('last_edited_at = CURRENT_TIMESTAMP');
    }
    
    if (data.status) {
      updates.push('status = ?');
      params.push(data.status);
    }
    
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }
    
    params.push(id);
    
    const stmt = db.prepare(`
      UPDATE essays SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
    
    return this.findById(id);
  }
  
  static delete(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('DELETE FROM essays WHERE id = ?');
    return stmt.run(id);
  }
}

module.exports = Essay;
