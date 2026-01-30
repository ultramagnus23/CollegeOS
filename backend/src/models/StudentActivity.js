// backend/src/models/StudentActivity.js
// Manages student extracurricular activities (Common App style)

const dbManager = require('../config/database');

class StudentActivity {
  /**
   * Activity types matching Common App categories
   */
  static ACTIVITY_TYPES = [
    'Academic',
    'Art',
    'Athletics: Club',
    'Athletics: JV/Varsity',
    'Career-Oriented',
    'Community Service (Volunteer)',
    'Computer/Technology',
    'Cultural',
    'Dance',
    'Debate/Speech',
    'Environmental',
    'Family Responsibilities',
    'Foreign Exchange',
    'Internship',
    'Journalism/Publication',
    'Junior ROTC',
    'LGBT',
    'Music: Instrumental',
    'Music: Vocal',
    'Religious',
    'Research',
    'Robotics',
    'School Spirit',
    'Science/Math',
    'Social Justice',
    'Student Government',
    'Theater/Drama',
    'Work (Paid)',
    'Other'
  ];
  
  /**
   * Tier definitions
   * 1 = National/International achievement
   * 2 = State/Regional achievement
   * 3 = School leadership/significant contribution
   * 4 = Participation/membership
   */
  static TIER_DEFINITIONS = {
    1: {
      name: 'Exceptional',
      description: 'National/International achievement',
      keywords: ['national', 'international', 'world', 'olympic', 'published', 'patent', 'ted', 'isef', 'usabo', 'usaco', 'imo', 'usa']
    },
    2: {
      name: 'Outstanding',
      description: 'State/Regional achievement',
      keywords: ['state', 'regional', 'district', 'county', 'all-state', 'semi-final', 'finalist']
    },
    3: {
      name: 'Strong',
      description: 'School leadership or significant contribution',
      keywords: ['president', 'captain', 'editor', 'founder', 'director', 'lead', 'head', 'chief', 'chair', 'organizer']
    },
    4: {
      name: 'Standard',
      description: 'Participation and membership',
      keywords: []
    }
  };
  
  /**
   * Create a new activity
   */
  static create(studentId, data) {
    const db = dbManager.getDatabase();
    
    // Auto-calculate tier if not provided
    const tier = data.tierRating || data.tier_rating || this.autoCalculateTier(data);
    
    // Calculate total hours
    const hoursPerWeek = data.hoursPerWeek || data.hours_per_week || 0;
    const weeksPerYear = data.weeksPerYear || data.weeks_per_year || 0;
    const yearsActive = this.countYearsActive(data);
    const totalHours = Math.round(hoursPerWeek * weeksPerYear * yearsActive);
    
    // Get next display order
    const orderStmt = db.prepare(`
      SELECT COALESCE(MAX(display_order), 0) + 1 as next_order 
      FROM student_activities 
      WHERE student_id = ?
    `);
    const nextOrder = orderStmt.get(studentId)?.next_order || 1;
    
    const stmt = db.prepare(`
      INSERT INTO student_activities (
        student_id, activity_name, activity_type, position_title, organization_name, description,
        grade_9, grade_10, grade_11, grade_12,
        hours_per_week, weeks_per_year, total_hours,
        awards_recognition, tier_rating,
        participation_during_school, participation_during_break, participation_all_year, participation_post_graduation,
        display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      studentId,
      data.activityName || data.activity_name,
      data.activityType || data.activity_type,
      data.positionTitle || data.position_title || null,
      data.organizationName || data.organization_name || null,
      data.description || null,
      data.grade9 || data.grade_9 ? 1 : 0,
      data.grade10 || data.grade_10 ? 1 : 0,
      data.grade11 || data.grade_11 ? 1 : 0,
      data.grade12 || data.grade_12 ? 1 : 0,
      hoursPerWeek,
      weeksPerYear,
      totalHours,
      data.awardsRecognition || data.awards_recognition || null,
      tier,
      data.participationDuringSchool || data.participation_during_school ? 1 : 0,
      data.participationDuringBreak || data.participation_during_break ? 1 : 0,
      data.participationAllYear || data.participation_all_year ? 1 : 0,
      data.participationPostGraduation || data.participation_post_graduation ? 1 : 0,
      nextOrder
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  /**
   * Update an activity
   */
  static update(id, data) {
    const db = dbManager.getDatabase();
    
    // Get existing activity
    const existing = this.findById(id);
    if (!existing) return null;
    
    // Merge data with existing
    const merged = { ...existing, ...data };
    
    // Recalculate tier if relevant fields changed
    let tier = data.tierRating || data.tier_rating;
    if (!tier) {
      tier = this.autoCalculateTier(merged);
    }
    
    // Recalculate total hours
    const hoursPerWeek = data.hoursPerWeek || data.hours_per_week || existing.hours_per_week || 0;
    const weeksPerYear = data.weeksPerYear || data.weeks_per_year || existing.weeks_per_year || 0;
    const yearsActive = this.countYearsActive(merged);
    const totalHours = Math.round(hoursPerWeek * weeksPerYear * yearsActive);
    
    const stmt = db.prepare(`
      UPDATE student_activities SET
        activity_name = ?,
        activity_type = ?,
        position_title = ?,
        organization_name = ?,
        description = ?,
        grade_9 = ?,
        grade_10 = ?,
        grade_11 = ?,
        grade_12 = ?,
        hours_per_week = ?,
        weeks_per_year = ?,
        total_hours = ?,
        awards_recognition = ?,
        tier_rating = ?,
        participation_during_school = ?,
        participation_during_break = ?,
        participation_all_year = ?,
        participation_post_graduation = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(
      data.activityName || data.activity_name || existing.activity_name,
      data.activityType || data.activity_type || existing.activity_type,
      data.positionTitle || data.position_title || existing.position_title,
      data.organizationName || data.organization_name || existing.organization_name,
      data.description || existing.description,
      data.grade9 !== undefined ? (data.grade9 ? 1 : 0) : (data.grade_9 !== undefined ? (data.grade_9 ? 1 : 0) : existing.grade_9),
      data.grade10 !== undefined ? (data.grade10 ? 1 : 0) : (data.grade_10 !== undefined ? (data.grade_10 ? 1 : 0) : existing.grade_10),
      data.grade11 !== undefined ? (data.grade11 ? 1 : 0) : (data.grade_11 !== undefined ? (data.grade_11 ? 1 : 0) : existing.grade_11),
      data.grade12 !== undefined ? (data.grade12 ? 1 : 0) : (data.grade_12 !== undefined ? (data.grade_12 ? 1 : 0) : existing.grade_12),
      hoursPerWeek,
      weeksPerYear,
      totalHours,
      data.awardsRecognition || data.awards_recognition || existing.awards_recognition,
      tier,
      data.participationDuringSchool !== undefined ? (data.participationDuringSchool ? 1 : 0) : existing.participation_during_school,
      data.participationDuringBreak !== undefined ? (data.participationDuringBreak ? 1 : 0) : existing.participation_during_break,
      data.participationAllYear !== undefined ? (data.participationAllYear ? 1 : 0) : existing.participation_all_year,
      data.participationPostGraduation !== undefined ? (data.participationPostGraduation ? 1 : 0) : existing.participation_post_graduation,
      id
    );
    
    return this.findById(id);
  }
  
  /**
   * Auto-calculate activity tier based on keywords
   */
  static autoCalculateTier(data) {
    const textToCheck = [
      data.activityName || data.activity_name || '',
      data.positionTitle || data.position_title || '',
      data.description || '',
      data.awardsRecognition || data.awards_recognition || ''
    ].join(' ').toLowerCase();
    
    // Check Tier 1 keywords
    for (const keyword of this.TIER_DEFINITIONS[1].keywords) {
      if (textToCheck.includes(keyword.toLowerCase())) {
        return 1;
      }
    }
    
    // Check Tier 2 keywords
    for (const keyword of this.TIER_DEFINITIONS[2].keywords) {
      if (textToCheck.includes(keyword.toLowerCase())) {
        return 2;
      }
    }
    
    // Check Tier 3 keywords
    for (const keyword of this.TIER_DEFINITIONS[3].keywords) {
      if (textToCheck.includes(keyword.toLowerCase())) {
        return 3;
      }
    }
    
    // Default to Tier 4
    return 4;
  }
  
  /**
   * Count years active based on grade flags
   */
  static countYearsActive(data) {
    let years = 0;
    if (data.grade9 || data.grade_9) years++;
    if (data.grade10 || data.grade_10) years++;
    if (data.grade11 || data.grade_11) years++;
    if (data.grade12 || data.grade_12) years++;
    return Math.max(1, years);
  }
  
  /**
   * Find activity by ID
   */
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM student_activities WHERE id = ?');
    return stmt.get(id);
  }
  
  /**
   * Get all activities for a student
   */
  static findByStudentId(studentId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM student_activities 
      WHERE student_id = ? 
      ORDER BY display_order ASC
    `);
    return stmt.all(studentId);
  }
  
  /**
   * Reorder activities
   */
  static reorder(studentId, activityIds) {
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      UPDATE student_activities 
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND student_id = ?
    `);
    
    for (let i = 0; i < activityIds.length; i++) {
      stmt.run(i + 1, activityIds[i], studentId);
    }
    
    return this.findByStudentId(studentId);
  }
  
  /**
   * Delete an activity
   */
  static delete(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('DELETE FROM student_activities WHERE id = ?');
    stmt.run(id);
    return true;
  }
  
  /**
   * Get tier summary for a student
   */
  static getTierSummary(studentId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT 
        tier_rating,
        COUNT(*) as count,
        SUM(total_hours) as total_hours
      FROM student_activities 
      WHERE student_id = ?
      GROUP BY tier_rating
      ORDER BY tier_rating ASC
    `);
    
    const rows = stmt.all(studentId);
    
    return {
      tier1: rows.find(r => r.tier_rating === 1) || { count: 0, total_hours: 0 },
      tier2: rows.find(r => r.tier_rating === 2) || { count: 0, total_hours: 0 },
      tier3: rows.find(r => r.tier_rating === 3) || { count: 0, total_hours: 0 },
      tier4: rows.find(r => r.tier_rating === 4) || { count: 0, total_hours: 0 },
      totalActivities: rows.reduce((sum, r) => sum + r.count, 0),
      totalHours: rows.reduce((sum, r) => sum + (r.total_hours || 0), 0)
    };
  }
}

module.exports = StudentActivity;
