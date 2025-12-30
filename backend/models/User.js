// backend/models/User.js
// User model with academic profile support
// This extends your existing user model to include college application-specific data

const db = require('../config/database');

class User {
  /**
   * Find user by ID with full profile
   */
  static async findById(id) {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          id, email, name, 
          academic_board, grade_level, graduation_year,
          subjects, percentage, gpa,
          medium_of_instruction, exams_taken,
          target_countries, intended_major,
          onboarding_completed, profile_completed,
          created_at, updated_at
        FROM users 
        WHERE id = ?
      `, [id], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(this._parseUser(row));
      });
    });
  }
  
  /**
   * Update user's academic profile
   */
  static async updateProfile(userId, profileData) {
    const {
      academic_board, grade_level, graduation_year,
      subjects, percentage, gpa,
      medium_of_instruction, exams_taken,
      target_countries, intended_major
    } = profileData;
    
    // Convert arrays/objects to JSON strings
    const subjectsJson = JSON.stringify(subjects || []);
    const examsJson = JSON.stringify(exams_taken || {});
    const countriesJson = JSON.stringify(target_countries || []);
    
    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE users SET
          academic_board = ?,
          grade_level = ?,
          graduation_year = ?,
          subjects = ?,
          percentage = ?,
          gpa = ?,
          medium_of_instruction = ?,
          exams_taken = ?,
          target_countries = ?,
          intended_major = ?,
          profile_completed = 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        academic_board, grade_level, graduation_year,
        subjectsJson, percentage, gpa,
        medium_of_instruction, examsJson,
        countriesJson, intended_major,
        userId
      ], function(err) {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }
  
  /**
   * Get user's academic profile for eligibility checking
   */
  static async getAcademicProfile(userId) {
    const user = await this.findById(userId);
    if (!user) return null;
    
    return {
      academic_board: user.academic_board,
      subjects: user.subjects,
      percentage: user.percentage,
      gpa: user.gpa,
      exams: user.exams_taken,
      medium_of_instruction: user.medium_of_instruction,
      grade_level: user.grade_level,
      graduation_year: user.graduation_year
    };
  }
  
  /**
   * Internal helper to parse user row
   */
  static _parseUser(row) {
    if (!row) return null;
    
    return {
      ...row,
      subjects: this._safeJsonParse(row.subjects, []),
      exams_taken: this._safeJsonParse(row.exams_taken, {}),
      target_countries: this._safeJsonParse(row.target_countries, [])
    };
  }
  
  static _safeJsonParse(str, defaultValue) {
    try {
      return JSON.parse(str || '{}');
    } catch (e) {
      return defaultValue;
    }
  }
}

module.exports = User;