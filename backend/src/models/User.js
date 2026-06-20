const bcrypt = require('bcrypt');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

let _usersColumnTypeCache = null;

class User {
  static _usersColumnTypeCache = null;

  static async getUsersColumnTypes() {
    if (this._usersColumnTypeCache) return this._usersColumnTypeCache;
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = ANY($1::text[])
      `,
      [['need_financial_aid', 'can_take_loan']]
    );
    this._usersColumnTypeCache = rows.reduce((acc, row) => {
      acc[row.column_name] = row.data_type;
      return acc;
    }, {});
    return this._usersColumnTypeCache;
  }

  static coerceBooleanLikeForColumn(rawValue, columnType) {
    if (rawValue === undefined || rawValue === null) return null;
    let boolValue = rawValue;
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      if (normalized === 'true') boolValue = true;
      else if (normalized === 'false') boolValue = false;
    }

    if (columnType === 'integer' || columnType === 'smallint' || columnType === 'bigint' || columnType === 'numeric') {
      return boolValue === true ? 1 : boolValue === false ? 0 : null;
    }
    if (columnType === 'boolean') {
      return boolValue === true || boolValue === false ? boolValue : null;
    }
    return boolValue == null ? null : String(boolValue);
  }

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

  static async getUsersColumnTypeMap(pool) {
    if (_usersColumnTypeCache) return _usersColumnTypeCache;
    const { rows } = await pool.query(
      `SELECT column_name, data_type, udt_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'`
    );
    _usersColumnTypeCache = rows.reduce((acc, row) => {
      acc[row.column_name] = {
        dataType: row.data_type,
        udtName: row.udt_name,
      };
      return acc;
    }, {});
    return _usersColumnTypeCache;
  }

  static _coerceBooleanToDb(value, columnMeta) {
    if (value === null || value === undefined) return null;
    const dataType = String(columnMeta?.dataType || '').toLowerCase();
    if (dataType.includes('boolean')) return Boolean(value);
    if (dataType.includes('integer') || dataType.includes('numeric') || dataType.includes('double') || dataType.includes('real')) {
      return value ? 1 : 0;
    }
    return value ? 'true' : 'false';
  }

  static _serializeForColumn(value, columnMeta) {
    if (value === null || value === undefined) return null;
    const dataType = String(columnMeta?.dataType || '').toLowerCase();
    const udtName = String(columnMeta?.udtName || '').toLowerCase();

    if (dataType === 'ARRAY' || udtName.startsWith('_')) {
      if (Array.isArray(value)) return value;
      return [String(value)];
    }

    if (dataType.includes('json')) {
      return JSON.stringify(value);
    }

    return JSON.stringify(value);
  }

  static async updateOnboarding(userId, data) {
    const pool = dbManager.getDatabase();
    const columnTypes = await this.getUsersColumnTypes();

    const satScore = data?.sat_score ?? data?.test_status?.sat_score ?? null;
    const actScore = data?.act_score ?? data?.test_status?.act_score ?? null;
    const rawGpa = data?.gpa != null ? parseFloat(data.gpa) : null;
    const normalizedGpa = rawGpa == null || Number.isNaN(rawGpa)
      ? null
      : (rawGpa > 10 ? (rawGpa / 100) * 4.0 : rawGpa);

    const parseBudgetRange = (value) => {
      if (typeof value !== 'string') return null;
      switch (value) {
        case '20k': return 20000;
        case 'under-20k':
        case 'under_20k': return 20000;
        case '40k': return 40000;
        case '20-40k':
        case '20k_40k': return 40000;
        case '40-60k': return 60000;
        case '40k_60k': return 60000;
        case '60k+': return 60000;
        case 'over_60k': return 60000;
        case 'aid': return 0;
        case 'need_aid': return 0;
        default: return null;
      }
    };

    const parsedBudget = data?.max_budget_per_year != null
      ? Math.round(Number(data.max_budget_per_year))
      : (data?.budget != null ? Math.round(Number(data.budget)) : parseBudgetRange(data?.budgetRange));
    const maxBudgetPerYear = Number.isFinite(parsedBudget) ? parsedBudget : null;
    const intendedMajors = Array.isArray(data?.intended_majors) ? data.intended_majors : [];
    const intendedMajor = data?.intended_major ?? intendedMajors[0] ?? null;
    const gradeLevel = data?.grade_level ?? data?.current_grade ?? null;
    const graduationYear = data?.graduation_year != null ? Number(data.graduation_year) : null;
    const parsedGraduationYear = Number.isFinite(graduationYear) ? graduationYear : null;
    const preferredLocation = data?.preferred_location ?? data?.locationPreference ?? null;
    const normalizedPreferredLocation = preferredLocation
      ? (Array.isArray(preferredLocation) ? preferredLocation.map(v => String(v).trim()).filter(Boolean) : [String(preferredLocation).trim()])
      : null;
    const needFinancialAidRaw = data?.need_financial_aid ?? (maxBudgetPerYear === 0 ? true : null);
    const canTakeLoanRaw = data?.can_take_loan ?? null;
    const needFinancialAid = this.coerceBooleanLikeForColumn(needFinancialAidRaw, columnTypes.need_financial_aid);
    const canTakeLoan = this.coerceBooleanLikeForColumn(canTakeLoanRaw, columnTypes.can_take_loan);

    const writePayload = {
      target_countries: data.target_countries || [],
      intended_majors: intendedMajors,
      test_status: data.test_status || {},
      language_preferences: data.language_preferences || [],
      gpa: normalizedGpa,
      sat_score: satScore != null ? Number(satScore) : null,
      act_score: actScore != null ? Number(actScore) : null,
      budget: maxBudgetPerYear,
      max_budget_per_year: maxBudgetPerYear,
      intended_major: intendedMajor,
      career_goals: data?.career_goals ?? data?.careerGoals ?? null,
      country: data?.country ?? null,
      need_financial_aid: needFinancialAid,
      can_take_loan: canTakeLoan,
      family_income_usd: data?.family_income_usd != null ? Number(data.family_income_usd) : null,
      grade_level: gradeLevel,
      graduation_year: parsedGraduationYear,
      preferred_location: normalizedPreferredLocation,
    };

    logger.debug('onboarding.pre_db_write', {
      userId,
      payloadKeys: Object.keys(writePayload),
      fieldTypes: Object.fromEntries(
        Object.entries(writePayload).map(([k, v]) => [k, v == null ? 'null' : Array.isArray(v) ? `array:${v.length}` : typeof v])
      ),
      preferred_location: normalizedPreferredLocation,
      preferred_location_type: normalizedPreferredLocation == null ? 'null' : Array.isArray(normalizedPreferredLocation) ? 'array' : 'string',
    });

    // Build the student_profiles (read-side) mirror values. The /profile/completion
    // endpoint, Settings page and the recommendation/chancing engines all read from
    // student_profiles — NOT users. Writing only `users` here is what made the
    // profile appear to reset to 0% on reload. We now write BOTH tables atomically.
    const gpaType = String(data?.gpa_type || 'percentage').toLowerCase();
    const boardExamPercentage = (gpaType === 'percentage' && rawGpa != null && !Number.isNaN(rawGpa)) ? rawGpa : null;
    const toJsonArray = (v) => JSON.stringify(Array.isArray(v) ? v : []);
    const interestTags = Array.isArray(data?.interest_tags) ? data.interest_tags : [];
    const subjectsArr = Array.isArray(data?.subjects) ? data.subjects : [];
    const activitiesArr = Array.isArray(data?.activities) ? data.activities : [];
    const traitWeights = (data?.trait_weights && typeof data.trait_weights === 'object' && !Array.isArray(data.trait_weights)) ? data.trait_weights : {};
    const dob = (() => {
      const v = data?.date_of_birth;
      return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) ? v.trim() : null;
    })();
    const preferredSetting = data?.preferred_setting ?? (Array.isArray(normalizedPreferredLocation) ? normalizedPreferredLocation[0] : null);
    const preferredCollegeSize = data?.preferred_college_size ?? null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE users
          SET target_countries    = $1,
              intended_majors     = $2,
              test_status         = $3,
              language_preferences = $4,
              onboarding_complete = 1,
              onboarding_completed = TRUE,
              gpa                 = COALESCE($6, gpa),
              sat_score           = COALESCE($7, sat_score),
              act_score           = COALESCE($8, act_score),
              budget              = COALESCE($9, budget),
              max_budget_per_year = COALESCE($10, max_budget_per_year),
              intended_major      = COALESCE($11, intended_major),
              career_goals        = COALESCE($12, career_goals),
              country             = COALESCE($13, country),
              need_financial_aid  = COALESCE($14, need_financial_aid),
              can_take_loan       = COALESCE($15, can_take_loan),
              family_income_usd   = COALESCE($16, family_income_usd),
              grade_level         = COALESCE($17, grade_level),
              graduation_year     = COALESCE($18, graduation_year),
              preferred_location  = COALESCE($19, preferred_location),
              updated_at          = NOW()
          WHERE id = $5`,
        [
          JSON.stringify(writePayload.target_countries),
          JSON.stringify(writePayload.intended_majors),
          JSON.stringify(writePayload.test_status),
          JSON.stringify(writePayload.language_preferences),
          userId,
          writePayload.gpa,
          writePayload.sat_score,
          writePayload.act_score,
          writePayload.budget,
          writePayload.max_budget_per_year,
          writePayload.intended_major,
          writePayload.career_goals,
          writePayload.country,
          writePayload.need_financial_aid,
          writePayload.can_take_loan,
          writePayload.family_income_usd,
          writePayload.grade_level,
          writePayload.graduation_year,
          writePayload.preferred_location,
        ]
      );

      const { rows: baseRows } = await client.query('SELECT email, full_name, country FROM users WHERE id = $1', [userId]);
      const baseUser = baseRows[0] || {};
      const fullName = (data?.name && String(data.name).trim()) || baseUser.full_name || '';
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || null;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
      const spCountry = writePayload.country ?? baseUser.country ?? null;

      await client.query(
        `INSERT INTO student_profiles (
           user_id, first_name, last_name, email, country, phone, date_of_birth,
           grade_level, graduation_year, high_school_name, curriculum_type, curriculum_type_other,
           gpa_unweighted, board_exam_percentage, overall_percentage, sat_total, act_composite,
           intended_major, intended_majors, subjects, preferred_countries,
           preferred_college_size, college_size_preference, preferred_setting, campus_setting_preference,
           budget_max, interest_tags, trait_weights, extracurriculars,
           career_goals, why_college, citizenship_status, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,
           $8,$9,$10,$11,$12,
           $13,$14,$15,$16,$17,
           $18,$19,$20,$21,
           $22,$23,$24,$25,
           $26,$27,$28,$29,
           $30,$31,$32,NOW()
         )
         ON CONFLICT (user_id) DO UPDATE SET
           first_name = COALESCE(EXCLUDED.first_name, student_profiles.first_name),
           last_name = COALESCE(EXCLUDED.last_name, student_profiles.last_name),
           email = COALESCE(EXCLUDED.email, student_profiles.email),
           country = COALESCE(EXCLUDED.country, student_profiles.country),
           phone = COALESCE(EXCLUDED.phone, student_profiles.phone),
           date_of_birth = COALESCE(EXCLUDED.date_of_birth, student_profiles.date_of_birth),
           grade_level = COALESCE(EXCLUDED.grade_level, student_profiles.grade_level),
           graduation_year = COALESCE(EXCLUDED.graduation_year, student_profiles.graduation_year),
           high_school_name = COALESCE(EXCLUDED.high_school_name, student_profiles.high_school_name),
           curriculum_type = COALESCE(EXCLUDED.curriculum_type, student_profiles.curriculum_type),
           curriculum_type_other = COALESCE(EXCLUDED.curriculum_type_other, student_profiles.curriculum_type_other),
           gpa_unweighted = COALESCE(EXCLUDED.gpa_unweighted, student_profiles.gpa_unweighted),
           board_exam_percentage = COALESCE(EXCLUDED.board_exam_percentage, student_profiles.board_exam_percentage),
           overall_percentage = COALESCE(EXCLUDED.overall_percentage, student_profiles.overall_percentage),
           sat_total = COALESCE(EXCLUDED.sat_total, student_profiles.sat_total),
           act_composite = COALESCE(EXCLUDED.act_composite, student_profiles.act_composite),
           intended_major = COALESCE(EXCLUDED.intended_major, student_profiles.intended_major),
           intended_majors = EXCLUDED.intended_majors,
           subjects = EXCLUDED.subjects,
           preferred_countries = EXCLUDED.preferred_countries,
           preferred_college_size = COALESCE(EXCLUDED.preferred_college_size, student_profiles.preferred_college_size),
           college_size_preference = COALESCE(EXCLUDED.college_size_preference, student_profiles.college_size_preference),
           preferred_setting = COALESCE(EXCLUDED.preferred_setting, student_profiles.preferred_setting),
           campus_setting_preference = COALESCE(EXCLUDED.campus_setting_preference, student_profiles.campus_setting_preference),
           budget_max = COALESCE(EXCLUDED.budget_max, student_profiles.budget_max),
           interest_tags = EXCLUDED.interest_tags,
           trait_weights = EXCLUDED.trait_weights,
           extracurriculars = EXCLUDED.extracurriculars,
           career_goals = COALESCE(EXCLUDED.career_goals, student_profiles.career_goals),
           why_college = COALESCE(EXCLUDED.why_college, student_profiles.why_college),
           citizenship_status = COALESCE(EXCLUDED.citizenship_status, student_profiles.citizenship_status),
           updated_at = NOW()`,
        [
          userId, firstName, lastName, baseUser.email || null, spCountry, data?.phone ?? null, dob,
          gradeLevel, parsedGraduationYear, data?.high_school_name ?? null, data?.curriculum_type ?? null, data?.curriculum_type_other ?? null,
          normalizedGpa, boardExamPercentage, boardExamPercentage, (satScore != null ? Number(satScore) : null), (actScore != null ? Number(actScore) : null),
          intendedMajor, toJsonArray(intendedMajors), toJsonArray(subjectsArr), toJsonArray(writePayload.target_countries),
          preferredCollegeSize, preferredCollegeSize, preferredSetting, preferredSetting,
          maxBudgetPerYear, toJsonArray(interestTags), JSON.stringify(traitWeights), JSON.stringify(activitiesArr),
          writePayload.career_goals, data?.why_college ?? null, (data?.citizenship ?? null),
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return this.findById(userId);
  }

  static async markTourComplete(userId) {
    const pool = dbManager.getDatabase();
    await pool.query(
      `UPDATE users SET has_completed_tour = TRUE, updated_at = NOW() WHERE id = $1`,
      [userId]
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

    // Parse JSON columns stored on users table with safe fallbacks
    const _parseJson = (v, def = []) => {
      if (!v) return def;
      try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return def; }
    };

    const testStatus  = _parseJson(user.test_status, {});
    const targetCountries = _parseJson(user.target_countries, []);
    const intendedMajors  = _parseJson(user.intended_majors, []);

    // Extended profile row — may not exist yet for new users
    const { rows: spRows } = await pool.query(
      'SELECT * FROM student_profiles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const sp = spRows[0] || {};

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
      // Values vector — used by recommendationEngine for values resonance scoring
      values_vector: sp.values_vector
        ? (typeof sp.values_vector === 'string' ? JSON.parse(sp.values_vector) : sp.values_vector)
        : null,
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
