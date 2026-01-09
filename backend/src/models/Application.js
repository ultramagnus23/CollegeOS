const dbManager = require('../config/database');

class Application {
  static create(userId, data) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO applications (
        user_id, college_id, status, application_type, priority, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userId,
      data.collegeId,
      data.status || 'researching',
      data.applicationType || null,
      data.priority || null,
      data.notes || null
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT a.*, c.name as college_name, c.country, c.official_website
      FROM applications a
      JOIN colleges c ON a.college_id = c.id
      WHERE a.id = ?
    `);
    return stmt.get(id);
  }
  
  static findByUser(userId, filters = {}) {
    const db = dbManager.getDatabase();
    let query = `
      SELECT a.*, c.name as college_name, c.country, c.official_website
      FROM applications a
      JOIN colleges c ON a.college_id = c.id
      WHERE a.user_id = ?
    `;
    const params = [userId];
    
    if (filters.status) {
      query += ' AND a.status = ?';
      params.push(filters.status);
    }
    
    if (filters.priority) {
      query += ' AND a.priority = ?';
      params.push(filters.priority);
    }
    
    query += ' ORDER BY a.created_at DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }
  
  static update(id, data) {
    const db = dbManager.getDatabase();
    const updates = [];
    const params = [];
    
    if (data.status) {
      updates.push('status = ?');
      params.push(data.status);
    }
    
    if (data.applicationType) {
      updates.push('application_type = ?');
      params.push(data.applicationType);
    }
    
    if (data.priority) {
      updates.push('priority = ?');
      params.push(data.priority);
    }
    
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }
    
    if (data.submittedAt) {
      updates.push('submitted_at = ?');
      params.push(data.submittedAt);
    }
    
    if (data.decisionReceivedAt) {
      updates.push('decision_received_at = ?');
      params.push(data.decisionReceivedAt);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const stmt = db.prepare(`
      UPDATE applications SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
    
    return this.findById(id);
  }
  
  static delete(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('DELETE FROM applications WHERE id = ?');
    return stmt.run(id);
  }
  
  static getTimeline(applicationId) {
    const db = dbManager.getDatabase();
    
    // Get application details
    const application = this.findById(applicationId);
    
    // Get all deadlines
    const deadlinesStmt = db.prepare(`
      SELECT * FROM deadlines WHERE application_id = ? ORDER BY deadline_date ASC
    `);
    const deadlines = deadlinesStmt.all(applicationId);
    
    // Get all essays
    const essaysStmt = db.prepare(`
      SELECT * FROM essays WHERE application_id = ? ORDER BY created_at ASC
    `);
    const essays = essaysStmt.all(applicationId);
    
    return {
      application,
      deadlines,
      essays,
      milestones: this._calculateMilestones(application, deadlines, essays)
    };
  }
  
  static _calculateMilestones(application, deadlines, essays) {
    const milestones = [];
    
    // Application creation
    milestones.push({
      type: 'application_created',
      date: application.created_at,
      completed: true
    });
    
    // Essay milestones
    essays.forEach(essay => {
      milestones.push({
        type: 'essay',
        essayType: essay.essay_type,
        status: essay.status,
        date: essay.created_at,
        completed: essay.status === 'final'
      });
    });
    
    // Deadline milestones
    deadlines.forEach(deadline => {
      milestones.push({
        type: 'deadline',
        deadlineType: deadline.deadline_type,
        date: deadline.deadline_date,
        completed: deadline.is_completed === 1
      });
    });
    
    // Application submission
    if (application.submitted_at) {
      milestones.push({
        type: 'application_submitted',
        date: application.submitted_at,
        completed: true
      });
    }
    
    // Decision
    if (application.decision_received_at) {
      milestones.push({
        type: 'decision_received',
        status: application.status,
        date: application.decision_received_at,
        completed: true
      });
    }
    
    return milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
}

module.exports = Application;