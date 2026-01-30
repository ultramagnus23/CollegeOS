// backend/src/models/StudentProfile.js
// Comprehensive student profile management

const dbManager = require('../config/database');

class StudentProfile {
  /**
   * Create or update a student profile
   */
  static upsert(userId, data) {
    const db = dbManager.getDatabase();
    
    // Check if profile exists
    const existing = this.findByUserId(userId);
    
    if (existing) {
      return this.update(userId, data);
    } else {
      return this.create(userId, data);
    }
  }
  
  /**
   * Create a new student profile
   */
  static create(userId, data) {
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO student_profiles (
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
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `);
    
    const result = stmt.run(
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
      data.isFirstGeneration || data.is_first_generation ? 1 : 0,
      data.isLegacy || data.is_legacy ? 1 : 0,
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
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  /**
   * Update an existing student profile
   */
  static update(userId, data) {
    const db = dbManager.getDatabase();
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    
    const fieldMap = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      graduationYear: 'graduation_year',
      gpaWeighted: 'gpa_weighted',
      gpaUnweighted: 'gpa_unweighted',
      gpaScale: 'gpa_scale',
      classRank: 'class_rank',
      classSize: 'class_size',
      classRankPercentile: 'class_rank_percentile',
      satEbrw: 'sat_ebrw',
      satMath: 'sat_math',
      satTotal: 'sat_total',
      actComposite: 'act_composite',
      actEnglish: 'act_english',
      actMath: 'act_math',
      actReading: 'act_reading',
      actScience: 'act_science',
      jeeMainPercentile: 'jee_main_percentile',
      jeeAdvancedRank: 'jee_advanced_rank',
      neetScore: 'neet_score',
      boardExamPercentage: 'board_exam_percentage',
      boardType: 'board_type',
      predictedALevels: 'predicted_a_levels',
      ibPredictedScore: 'ib_predicted_score',
      gcseResults: 'gcse_results',
      abiturGrade: 'abitur_grade',
      germanProficiency: 'german_proficiency',
      toeflScore: 'toefl_score',
      ieltsScore: 'ielts_score',
      duolingoScore: 'duolingo_score',
      country: 'country',
      stateProvince: 'state_province',
      city: 'city',
      highSchoolName: 'high_school_name',
      highSchoolType: 'high_school_type',
      curriculumType: 'curriculum_type',
      isFirstGeneration: 'is_first_generation',
      isLegacy: 'is_legacy',
      legacySchools: 'legacy_schools',
      ethnicity: 'ethnicity',
      citizenshipStatus: 'citizenship_status',
      intendedMajors: 'intended_majors',
      preferredStates: 'preferred_states',
      preferredCountries: 'preferred_countries',
      preferredCollegeSize: 'preferred_college_size',
      preferredSetting: 'preferred_setting',
      budgetMax: 'budget_max',
      minAcceptanceRate: 'min_acceptance_rate',
      maxAcceptanceRate: 'max_acceptance_rate',
      specialCircumstances: 'special_circumstances',
      hooks: 'hooks'
    };
    
    for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
      if (data[camelKey] !== undefined || data[snakeKey] !== undefined) {
        let value = data[camelKey] !== undefined ? data[camelKey] : data[snakeKey];
        
        // Handle arrays - stringify them
        if (Array.isArray(value)) {
          value = JSON.stringify(value);
        }
        
        // Handle booleans
        if (typeof value === 'boolean') {
          value = value ? 1 : 0;
        }
        
        fields.push(`${snakeKey} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      return this.findByUserId(userId);
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);
    
    const stmt = db.prepare(`
      UPDATE student_profiles 
      SET ${fields.join(', ')}
      WHERE user_id = ?
    `);
    
    stmt.run(...values);
    return this.findByUserId(userId);
  }
  
  /**
   * Find profile by user ID
   */
  static findByUserId(userId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?');
    const profile = stmt.get(userId);
    
    if (profile) {
      // Parse JSON fields
      profile.legacySchools = JSON.parse(profile.legacy_schools || '[]');
      profile.intendedMajors = JSON.parse(profile.intended_majors || '[]');
      profile.preferredStates = JSON.parse(profile.preferred_states || '[]');
      profile.preferredCountries = JSON.parse(profile.preferred_countries || '[]');
      profile.hooks = JSON.parse(profile.hooks || '[]');
    }
    
    return profile;
  }
  
  /**
   * Find profile by ID
   */
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM student_profiles WHERE id = ?');
    const profile = stmt.get(id);
    
    if (profile) {
      profile.legacySchools = JSON.parse(profile.legacy_schools || '[]');
      profile.intendedMajors = JSON.parse(profile.intended_majors || '[]');
      profile.preferredStates = JSON.parse(profile.preferred_states || '[]');
      profile.preferredCountries = JSON.parse(profile.preferred_countries || '[]');
      profile.hooks = JSON.parse(profile.hooks || '[]');
    }
    
    return profile;
  }
  
  /**
   * Get complete profile with activities, coursework, and awards
   */
  static getCompleteProfile(userId) {
    const profile = this.findByUserId(userId);
    
    if (!profile) {
      return null;
    }
    
    const db = dbManager.getDatabase();
    
    // Get activities
    const activitiesStmt = db.prepare(`
      SELECT * FROM student_activities 
      WHERE student_id = ? 
      ORDER BY display_order ASC
    `);
    profile.activities = activitiesStmt.all(profile.id);
    
    // Get coursework
    const courseworkStmt = db.prepare(`
      SELECT * FROM student_coursework 
      WHERE student_id = ? 
      ORDER BY grade_level DESC, course_name ASC
    `);
    profile.coursework = courseworkStmt.all(profile.id);
    
    // Get awards
    const awardsStmt = db.prepare(`
      SELECT * FROM student_awards 
      WHERE student_id = ? 
      ORDER BY display_order ASC
    `);
    profile.awards = awardsStmt.all(profile.id);
    
    // Calculate stats
    profile.stats = this.calculateProfileStats(profile);
    
    return profile;
  }
  
  /**
   * Calculate profile statistics
   */
  static calculateProfileStats(profile) {
    const stats = {
      totalActivities: profile.activities?.length || 0,
      tier1Activities: 0,
      tier2Activities: 0,
      totalActivityHours: 0,
      apIbCourses: 0,
      honorsCourses: 0,
      totalAwards: profile.awards?.length || 0,
      nationalAwards: 0,
      stateAwards: 0
    };
    
    // Activity stats
    if (profile.activities) {
      for (const activity of profile.activities) {
        if (activity.tier_rating === 1) stats.tier1Activities++;
        if (activity.tier_rating === 2) stats.tier2Activities++;
        if (activity.total_hours) stats.totalActivityHours += activity.total_hours;
      }
    }
    
    // Coursework stats
    if (profile.coursework) {
      for (const course of profile.coursework) {
        if (course.course_level === 'AP' || course.course_level === 'IB') stats.apIbCourses++;
        if (course.course_level === 'Honors') stats.honorsCourses++;
      }
    }
    
    // Award stats
    if (profile.awards) {
      for (const award of profile.awards) {
        if (award.award_level === 'National' || award.award_level === 'International') stats.nationalAwards++;
        if (award.award_level === 'State') stats.stateAwards++;
      }
    }
    
    return stats;
  }
  
  /**
   * Delete profile
   */
  static delete(userId) {
    const db = dbManager.getDatabase();
    
    // Get profile ID first
    const profile = this.findByUserId(userId);
    if (!profile) return false;
    
    // Delete related records (cascading should handle this, but be explicit)
    db.prepare('DELETE FROM student_activities WHERE student_id = ?').run(profile.id);
    db.prepare('DELETE FROM student_coursework WHERE student_id = ?').run(profile.id);
    db.prepare('DELETE FROM student_awards WHERE student_id = ?').run(profile.id);
    db.prepare('DELETE FROM student_profiles WHERE id = ?').run(profile.id);
    
    return true;
  }
}

module.exports = StudentProfile;
