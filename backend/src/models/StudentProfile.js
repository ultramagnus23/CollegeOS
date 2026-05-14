// backend/src/models/StudentProfile.js
const dbManager = require('../config/database');

class StudentProfile {
  static async upsert(userId, data) {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return this.update(userId, data);
    } else {
      return this.create(userId, data);
    }
  }

  static async create(userId, data) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `INSERT INTO student_profiles (
        user_id, first_name, last_name, email, graduation_year,
        gpa_weighted, gpa_unweighted, gpa_scale, class_rank, class_size, class_rank_percentile,
        sat_ebrw, sat_math, sat_total,
        act_composite, act_english, act_math, act_reading, act_science,
        jee_main_percentile, jee_advanced_rank, neet_score, board_exam_percentage, board_type,
        predicted_a_levels, ib_predicted_score, gcse_results,
        abitur_grade, german_proficiency,
        toefl_score, ielts_score, duolingo_score,
        country, state_province, city, high_school_name, high_school_type, curriculum_type,
        is_first_generation, is_legacy, legacy_schools, ethnicity, citizenship_status,
        intended_majors, preferred_states, preferred_countries, preferred_college_size, preferred_setting,
        budget_max, min_acceptance_rate, max_acceptance_rate,
        special_circumstances, hooks
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
        $39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53
      ) RETURNING id`,
      [
        userId,
        data.firstName || data.first_name || null,
        data.lastName || data.last_name || null,
        data.email || null,
        data.graduationYear || data.graduation_year || null,
        data.gpaWeighted || data.gpa_weighted || null,
        data.gpaUnweighted || data.gpa_unweighted || null,
        data.gpaScale || data.gpa_scale || '4.0',
        data.classRank || data.class_rank || null,
        data.classSize || data.class_size || null,
        data.classRankPercentile || data.class_rank_percentile || null,
        data.satEbrw || data.sat_ebrw || null,
        data.satMath || data.sat_math || null,
        data.satTotal || data.sat_total || null,
        data.actComposite || data.act_composite || null,
        data.actEnglish || data.act_english || null,
        data.actMath || data.act_math || null,
        data.actReading || data.act_reading || null,
        data.actScience || data.act_science || null,
        data.jeeMainPercentile || data.jee_main_percentile || null,
        data.jeeAdvancedRank || data.jee_advanced_rank || null,
        data.neetScore || data.neet_score || null,
        data.boardExamPercentage || data.board_exam_percentage || null,
        data.boardType || data.board_type || null,
        data.predictedALevels || data.predicted_a_levels || null,
        data.ibPredictedScore || data.ib_predicted_score || null,
        data.gcseResults || data.gcse_results || null,
        data.abiturGrade || data.abitur_grade || null,
        data.germanProficiency || data.german_proficiency || null,
        data.toeflScore || data.toefl_score || null,
        data.ieltsScore || data.ielts_score || null,
        data.duolingoScore || data.duolingo_score || null,
        data.country || null,
        data.stateProvince || data.state_province || null,
        data.city || null,
        data.highSchoolName || data.high_school_name || null,
        data.highSchoolType || data.high_school_type || null,
        data.curriculumType || data.curriculum_type || null,
        !!(data.isFirstGeneration || data.is_first_generation),
        !!(data.isLegacy || data.is_legacy),
        JSON.stringify(data.legacySchools || data.legacy_schools || []),
        data.ethnicity || null,
        data.citizenshipStatus || data.citizenship_status || null,
        JSON.stringify(data.intendedMajors || data.intended_majors || []),
        JSON.stringify(data.preferredStates || data.preferred_states || []),
        JSON.stringify(data.preferredCountries || data.preferred_countries || []),
        data.preferredCollegeSize || data.preferred_college_size || null,
        data.preferredSetting || data.preferred_setting || null,
        data.budgetMax || data.budget_max || null,
        data.minAcceptanceRate || data.min_acceptance_rate || null,
        data.maxAcceptanceRate || data.max_acceptance_rate || null,
        data.specialCircumstances || data.special_circumstances || null,
        JSON.stringify(data.hooks || [])
      ]
    );
    return this.findById(rows[0].id);
  }

  static async update(userId, data) {
    const pool = dbManager.getDatabase();
    const fields = [];
    const values = [];
    let idx = 1;

    const fieldMap = {
      firstName: 'first_name', lastName: 'last_name', email: 'email',
      graduationYear: 'graduation_year', gpaWeighted: 'gpa_weighted',
      gpaUnweighted: 'gpa_unweighted', gpaScale: 'gpa_scale',
      classRank: 'class_rank', classSize: 'class_size', classRankPercentile: 'class_rank_percentile',
      satEbrw: 'sat_ebrw', satMath: 'sat_math', satTotal: 'sat_total',
      actComposite: 'act_composite', actEnglish: 'act_english', actMath: 'act_math',
      actReading: 'act_reading', actScience: 'act_science',
      jeeMainPercentile: 'jee_main_percentile', jeeAdvancedRank: 'jee_advanced_rank',
      neetScore: 'neet_score', boardExamPercentage: 'board_exam_percentage', boardType: 'board_type',
      predictedALevels: 'predicted_a_levels', ibPredictedScore: 'ib_predicted_score',
      gcseResults: 'gcse_results', abiturGrade: 'abitur_grade', germanProficiency: 'german_proficiency',
      toeflScore: 'toefl_score', ieltsScore: 'ielts_score', duolingoScore: 'duolingo_score',
      country: 'country', stateProvince: 'state_province', city: 'city',
      highSchoolName: 'high_school_name', highSchoolType: 'high_school_type',
      curriculumType: 'curriculum_type', isFirstGeneration: 'is_first_generation',
      isLegacy: 'is_legacy', legacySchools: 'legacy_schools', ethnicity: 'ethnicity',
      citizenshipStatus: 'citizenship_status', intendedMajors: 'intended_majors',
      preferredStates: 'preferred_states', preferredCountries: 'preferred_countries',
      preferredCollegeSize: 'preferred_college_size', preferredSetting: 'preferred_setting',
      budgetMax: 'budget_max', minAcceptanceRate: 'min_acceptance_rate',
      maxAcceptanceRate: 'max_acceptance_rate', specialCircumstances: 'special_circumstances',
      hooks: 'hooks',
      careerGoals: 'career_goals',
      whyCollege: 'why_college',
      interestTags: 'interest_tags',
      phone: 'phone',
      dateOfBirth: 'date_of_birth',
      date_of_birth: 'date_of_birth',
      gradeLevel: 'grade_level',
      grade_level: 'grade_level',
      stream: 'stream',
      subjects: 'subjects',
      customSubjects: 'custom_subjects',
      custom_subjects: 'custom_subjects',
      customMajors: 'custom_majors',
      custom_majors: 'custom_majors',
      curriculumTypeOther: 'curriculum_type_other',
      curriculum_type_other: 'curriculum_type_other',
      traitWeights: 'trait_weights',
      trait_weights: 'trait_weights',
      traitProfile: 'trait_profile',
      trait_profile: 'trait_profile',
      traitInterpretation: 'trait_interpretation',
      trait_interpretation: 'trait_interpretation',
      schoolName: 'high_school_name',
      school_name: 'high_school_name',
      // Chancing / migration-066 fields
      extracurriculars: 'extracurriculars',
      awards: 'awards',
      leadershipRoles: 'leadership_roles',
      research: 'research',
      needBasedAid: 'need_based_aid',
      intendedMajor: 'intended_major',
      schoolType: 'school_type',
      // Onboarding checkpoint
      onboardingStep: 'onboarding_step',
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
      if (data[camelKey] !== undefined || data[snakeKey] !== undefined) {
        let value = data[camelKey] !== undefined ? data[camelKey] : data[snakeKey];
        if (Array.isArray(value)) value = JSON.stringify(value);
        if (value && typeof value === 'object' && !Array.isArray(value)) value = JSON.stringify(value);
        if (typeof value === 'boolean') value = value;
        fields.push(`${snakeKey} = $${idx++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.findByUserId(userId);

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    await pool.query(
      `UPDATE student_profiles SET ${fields.join(', ')} WHERE user_id = $${idx}`,
      values
    );
    return this.findByUserId(userId);
  }

  static async findByUserId(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM student_profiles WHERE user_id = $1', [userId]);
    const profile = rows[0];
    if (profile) {
      profile.legacySchools = this._parseJson(profile.legacy_schools, []);
      profile.intendedMajors = this._parseJson(profile.intended_majors, []);
      profile.preferredStates = this._parseJson(profile.preferred_states, []);
      profile.preferredCountries = this._parseJson(profile.preferred_countries, []);
      profile.hooks = this._parseJson(profile.hooks, []);
      profile.interestTags = this._parseJson(profile.interest_tags, []);
      profile.subjects = this._parseJson(profile.subjects, []);
      profile.custom_subjects = this._parseJson(profile.custom_subjects, []);
      profile.custom_majors = this._parseJson(profile.custom_majors, []);
      profile.trait_weights = this._parseJson(profile.trait_weights, {});
      profile.trait_profile = this._parseJson(profile.trait_profile, null);
      profile.trait_interpretation = this._parseJson(profile.trait_interpretation, null);
    }
    return profile || null;
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM student_profiles WHERE id = $1', [id]);
    const profile = rows[0];
    if (profile) {
      profile.legacySchools = this._parseJson(profile.legacy_schools, []);
      profile.intendedMajors = this._parseJson(profile.intended_majors, []);
      profile.preferredStates = this._parseJson(profile.preferred_states, []);
      profile.preferredCountries = this._parseJson(profile.preferred_countries, []);
      profile.hooks = this._parseJson(profile.hooks, []);
      profile.interestTags = this._parseJson(profile.interest_tags, []);
      profile.subjects = this._parseJson(profile.subjects, []);
      profile.custom_subjects = this._parseJson(profile.custom_subjects, []);
      profile.custom_majors = this._parseJson(profile.custom_majors, []);
      profile.trait_weights = this._parseJson(profile.trait_weights, {});
      profile.trait_profile = this._parseJson(profile.trait_profile, null);
      profile.trait_interpretation = this._parseJson(profile.trait_interpretation, null);
    }
    return profile || null;
  }

  static async getCompleteProfile(userId) {
    const profile = await this.findByUserId(userId);
    if (!profile) return null;

    const pool = dbManager.getDatabase();
    const { rows: activities } = await pool.query(
      'SELECT * FROM student_activities WHERE student_id = $1 ORDER BY display_order ASC',
      [profile.id]
    );
    profile.activities = activities;

    const { rows: coursework } = await pool.query(
      'SELECT * FROM student_coursework WHERE student_id = $1 ORDER BY grade_level DESC, course_name ASC',
      [profile.id]
    );
    profile.coursework = coursework;

    const { rows: awards } = await pool.query(
      'SELECT * FROM student_awards WHERE student_id = $1 ORDER BY display_order ASC',
      [profile.id]
    );
    profile.awards = awards;

    profile.stats = this.calculateProfileStats(profile);
    return profile;
  }

  static calculateProfileStats(profile) {
    const stats = {
      totalActivities: profile.activities?.length || 0,
      tier1Activities: 0, tier2Activities: 0, totalActivityHours: 0,
      apIbCourses: 0, honorsCourses: 0,
      totalAwards: profile.awards?.length || 0, nationalAwards: 0, stateAwards: 0
    };
    if (profile.activities) {
      for (const a of profile.activities) {
        if (a.tier_rating === 1) stats.tier1Activities++;
        if (a.tier_rating === 2) stats.tier2Activities++;
        if (a.total_hours) stats.totalActivityHours += a.total_hours;
      }
    }
    if (profile.coursework) {
      for (const c of profile.coursework) {
        if (c.course_level === 'AP' || c.course_level === 'IB') stats.apIbCourses++;
        if (c.course_level === 'Honors') stats.honorsCourses++;
      }
    }
    if (profile.awards) {
      for (const a of profile.awards) {
        if (a.award_level === 'National' || a.award_level === 'International') stats.nationalAwards++;
        if (a.award_level === 'State') stats.stateAwards++;
      }
    }
    return stats;
  }

  static async delete(userId) {
    const pool = dbManager.getDatabase();
    const profile = await this.findByUserId(userId);
    if (!profile) return false;
    await pool.query('DELETE FROM student_activities WHERE student_id = $1', [profile.id]);
    await pool.query('DELETE FROM student_coursework WHERE student_id = $1', [profile.id]);
    await pool.query('DELETE FROM student_awards WHERE student_id = $1', [profile.id]);
    await pool.query('DELETE FROM student_profiles WHERE id = $1', [profile.id]);
    return true;
  }

  static _parseJson(val, def) {
    if (!val) return def;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return def; }
  }
}

module.exports = StudentProfile;
