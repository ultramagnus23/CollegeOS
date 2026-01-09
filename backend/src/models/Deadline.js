const dbManager = require('../config/database');

class Deadline {
  static create(data) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO deadlines (
        application_id, deadline_type, deadline_date, 
        description, source_url
      ) VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      data.applicationId,
      data.deadlineType,
      data.deadlineDate,
      data.description || null,
      data.sourceUrl || null
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM deadlines WHERE id = ?');
    return stmt.get(id);
  }
  
  static findByApplication(applicationId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM deadlines 
      WHERE application_id = ? 
      ORDER BY deadline_date ASC
    `);
    return stmt.all(applicationId);
  }
  
  static findUpcoming(userId, daysAhead = 30) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT d.*, a.college_id, c.name as college_name
      FROM deadlines d
      JOIN applications a ON d.application_id = a.id
      JOIN colleges c ON a.college_id = c.id
      WHERE a.user_id = ?
        AND d.is_completed = 0
        AND d.deadline_date BETWEEN datetime('now') AND datetime('now', '+' || ? || ' days')
      ORDER BY d.deadline_date ASC
    `);
    return stmt.all(userId, daysAhead);
  }
  
  static update(id, data) {
    const db = dbManager.getDatabase();
    const updates = [];
    const params = [];
    
    if (data.deadlineDate) {
      updates.push('deadline_date = ?');
      params.push(data.deadlineDate);
    }
    
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    
    if (data.isCompleted !== undefined) {
      updates.push('is_completed = ?');
      params.push(data.isCompleted ? 1 : 0);
      
      if (data.isCompleted) {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    
    params.push(id);
    
    const stmt = db.prepare(`
      UPDATE deadlines SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
    
    return this.findById(id);
  }
  
  static delete(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('DELETE FROM deadlines WHERE id = ?');
    return stmt.run(id);
  }
}

module.exports = Deadline;