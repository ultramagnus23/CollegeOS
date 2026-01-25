const bcrypt = require('bcrypt');
const dbManager = require('../config/database');

class User {
  static create({ email, passwordHash, googleId, fullName, country }) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, google_id, full_name, country)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(email, passwordHash, googleId, fullName, country);
    return this.findById(result.lastInsertRowid);
  }
  
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id);
    
    if (user) {
      user.targetCountries = user.target_countries ? JSON.parse(user.target_countries) : [];
      user.intendedMajors = user.intended_majors ? JSON.parse(user.intended_majors) : [];
      user.testStatus = user.test_status ? JSON.parse(user.test_status) : {};
      user.languagePreferences = user.language_preferences ? JSON.parse(user.language_preferences) : [];
    }
    
    return user;
  }
  
  static findByEmail(email) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }
  
  static findByGoogleId(googleId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE google_id = ?');
    return stmt.get(googleId);
  }
  
  static updateOnboarding(userId, data) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      UPDATE users 
      SET target_countries = ?,
          intended_majors = ?,
          test_status = ?,
          language_preferences = ?,
          onboarding_complete = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(
      JSON.stringify(data.targetCountries),
      JSON.stringify(data.intendedMajors),
      JSON.stringify(data.testStatus),
      JSON.stringify(data.languagePreferences),
      userId
    );
    
    return this.findById(userId);
  }
  
  static async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
  
  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  /**
   * Get the academic profile for a user, formatted for the recommendation engine
   * Returns null if user not found or profile incomplete
   * @param {number} userId - The user ID
   * @returns {Object|null} Academic profile with normalized fields
   */
  static getAcademicProfile(userId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(userId);
    
    if (!user) {
      return null;
    }

    // Parse JSON fields safely
    const parseJSON = (field) => {
      if (!field) return [];
      try {
        return typeof field === 'string' ? JSON.parse(field) : field;
      } catch {
        return [];
      }
    };

    const parseJSONObject = (field) => {
      if (!field) return {};
      try {
        return typeof field === 'string' ? JSON.parse(field) : field;
      } catch {
        return {};
      }
    };

    // Build academic profile
    const profile = {
      // User identification
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      
      // Academic info
      academic_board: user.academic_board || null,
      grade_level: user.grade_level || null,
      graduation_year: user.graduation_year || null,
      subjects: parseJSON(user.subjects),
      percentage: user.percentage || null,
      gpa: user.gpa || null,
      medium_of_instruction: user.medium_of_instruction || null,
      
      // Exams
      exams: parseJSONObject(user.exams_taken),
      
      // Financial
      financial: {
        max_budget_per_year: user.max_budget_per_year || null,
        can_take_loan: Boolean(user.can_take_loan),
        need_financial_aid: Boolean(user.need_financial_aid)
      },
      
      // Preferences
      preferences: {
        target_countries: parseJSON(user.target_countries),
        intended_major: user.intended_major || (parseJSON(user.intended_majors)[0]) || null,
        intended_majors: parseJSON(user.intended_majors),
        career_goals: user.career_goals || null,
        language_preferences: parseJSON(user.language_preferences)
      },
      
      // Status
      onboarding_complete: Boolean(user.onboarding_complete),
      profile_completed: Boolean(user.profile_completed)
    };

    // Also expose top-level shortcuts for backward compatibility
    profile.academic = {
      board: profile.academic_board,
      percentage: profile.percentage,
      gpa: profile.gpa,
      subjects: profile.subjects
    };

    return profile;
  }

  /**
   * Update the academic profile for a user
   * @param {number} userId - The user ID
   * @param {Object} data - Academic profile data to update
   * @returns {Object|null} Updated user profile
   */
  static updateAcademicProfile(userId, data) {
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      UPDATE users 
      SET academic_board = COALESCE(?, academic_board),
          grade_level = COALESCE(?, grade_level),
          graduation_year = COALESCE(?, graduation_year),
          subjects = COALESCE(?, subjects),
          percentage = COALESCE(?, percentage),
          gpa = COALESCE(?, gpa),
          medium_of_instruction = COALESCE(?, medium_of_instruction),
          exams_taken = COALESCE(?, exams_taken),
          max_budget_per_year = COALESCE(?, max_budget_per_year),
          can_take_loan = COALESCE(?, can_take_loan),
          need_financial_aid = COALESCE(?, need_financial_aid),
          target_countries = COALESCE(?, target_countries),
          intended_major = COALESCE(?, intended_major),
          intended_majors = COALESCE(?, intended_majors),
          career_goals = COALESCE(?, career_goals),
          profile_completed = COALESCE(?, profile_completed),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      data.academic_board || null,
      data.grade_level || null,
      data.graduation_year || null,
      data.subjects ? JSON.stringify(data.subjects) : null,
      data.percentage || null,
      data.gpa || null,
      data.medium_of_instruction || null,
      data.exams_taken ? JSON.stringify(data.exams_taken) : null,
      data.max_budget_per_year || null,
      data.can_take_loan !== undefined ? (data.can_take_loan ? 1 : 0) : null,
      data.need_financial_aid !== undefined ? (data.need_financial_aid ? 1 : 0) : null,
      data.target_countries ? JSON.stringify(data.target_countries) : null,
      data.intended_major || null,
      data.intended_majors ? JSON.stringify(data.intended_majors) : null,
      data.career_goals || null,
      data.profile_completed !== undefined ? (data.profile_completed ? 1 : 0) : null,
      userId
    );

    return this.getAcademicProfile(userId);
  }
}

module.exports = User;
