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
  
  static async getAcademicProfile(userId) {
  const user = await this.findById(userId);
  if (!user) return null;
  
  return {
    academic_board: user.academic_board,
    subjects: user.subjects,
    percentage: user.percentage,
    gpa: user.gpa,
    exams_taken: user.exams_taken,
    medium_of_instruction: user.medium_of_instruction,
    grade_level: user.grade_level,
    graduation_year: user.graduation_year,
    financial: {
      max_budget_per_year: user.max_budget_per_year,
      can_take_loan: user.can_take_loan,
      need_financial_aid: user.need_financial_aid
    },
    preferences: {
      target_countries: user.target_countries,
      intended_major: user.intended_major,
      career_goals: user.career_goals
    }
  };
}
}

module.exports = User;