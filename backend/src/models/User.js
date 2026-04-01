const bcrypt = require('bcrypt');
const dbManager = require('../config/database');

class User {
  static async create({ email, passwordHash, googleId, fullName, country }) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, google_id, full_name, country)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, passwordHash, googleId, fullName, country]
    );
    return this.findById(rows[0].id);
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = rows[0];
    if (user) {
      user.targetCountries = user.target_countries ? JSON.parse(user.target_countries) : [];
      user.intendedMajors = user.intended_majors ? JSON.parse(user.intended_majors) : [];
      user.testStatus = user.test_status ? JSON.parse(user.test_status) : {};
      user.languagePreferences = user.language_preferences ? JSON.parse(user.language_preferences) : [];
    }
    return user || null;
  }

  static async findByEmail(email) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  }

  static async findByGoogleId(googleId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    return rows[0] || null;
  }

  static async updateOnboarding(userId, data) {
    const pool = dbManager.getDatabase();
    await pool.query(
      `UPDATE users
       SET target_countries = $1, intended_majors = $2, test_status = $3,
           language_preferences = $4, onboarding_complete = TRUE, updated_at = NOW()
       WHERE id = $5`,
      [
        JSON.stringify(data.target_countries),
        JSON.stringify(data.intended_majors),
        JSON.stringify(data.test_status),
        JSON.stringify(data.language_preferences),
        userId
      ]
    );
    return this.findById(userId);
  }

  /**
   * Return a merged academic profile for use by the recommendation engine and
   * eligibility checker.  Combines the core `users` row (GPA, test scores,
   * onboarding answers) with the extended `student_profiles` row (subjects,
   * curriculum, budget, preferred countries, etc.).
   *
   * Both callers (`recommendations.js` route and `collegeController.js`) rely
   * on this method.  Returns `null` if neither table has a row for the user.
   */
  static async getAcademicProfile(userId) {
    const pool = dbManager.getDatabase();

    // Primary row — always exists for authenticated users
    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRows[0];
    if (!user) return null;

    // Parse JSON columns stored on users table
    const testStatus  = user.test_status        ? JSON.parse(user.test_status)        : {};
    const targetCountries = user.target_countries ? JSON.parse(user.target_countries)  : [];
    const intendedMajors  = user.intended_majors  ? JSON.parse(user.intended_majors)   : [];

    // Extended profile row — may not exist yet for new users
    const { rows: spRows } = await pool.query(
      'SELECT * FROM student_profiles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const sp = spRows[0] || {};

    const _parseJson = (v, def = []) => {
      if (!v) return def;
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return def; }
    };

    // Merge into a flat object that eligibilityChecker and recommendationEngine
    // both understand.  We expose both the flat keys (used by eligibilityChecker)
    // AND nested sub-objects (used by recommendationEngine).
    return {
      // Identity
      id:            userId,
      email:         user.email,
      full_name:     user.full_name,

      // Academic board / curriculum — flat (eligibilityChecker)
      academic_board:   sp.board_type || sp.curriculum_type || null,
      percentage:       sp.board_exam_percentage || null,
      gpa:              sp.gpa_weighted || sp.gpa_unweighted || user.gpa || null,
      subjects:         _parseJson(sp.subjects || user.subjects, []),

      // Test scores — flat
      sat_score:  testStatus.sat_score  || sp.sat_total || null,
      act_score:  testStatus.act_score  || sp.act_composite || null,
      ib_score:   testStatus.ib_predicted || sp.ib_predicted_score || null,
      toefl:      sp.toefl_score || null,
      ielts:      sp.ielts_score || null,

      // Country / citizenship
      country:          sp.country || user.country || null,
      citizenship:      sp.citizenship_status || null,

      // Preferences (flat + nested — both used by different callers)
      target_countries:  _parseJson(sp.preferred_countries || user.target_countries, targetCountries),
      intended_majors:   _parseJson(sp.intended_majors || user.intended_majors, intendedMajors),

      // Nested sub-objects for recommendationEngine
      preferences: {
        intended_major: (_parseJson(sp.intended_majors || user.intended_majors, intendedMajors))[0] || null,
        preferred_countries: _parseJson(sp.preferred_countries || user.target_countries, targetCountries),
        preferred_setting: sp.preferred_setting || null,
        preferred_size:    sp.preferred_college_size || null,
      },
      academic: {
        percentage: sp.board_exam_percentage || null,
        gpa:        sp.gpa_weighted || sp.gpa_unweighted || user.gpa || null,
        sat_score:  testStatus.sat_score  || sp.sat_total || null,
        act_score:  testStatus.act_score  || sp.act_composite || null,
        ib_score:   testStatus.ib_predicted || sp.ib_predicted_score || null,
      },
      financial: {
        max_budget_per_year: sp.budget_max || null,
        need_financial_aid:  !!(sp.budget_max && sp.budget_max < 50000),
        can_take_loan:       false,
      },
    };
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }
}

module.exports = User;
