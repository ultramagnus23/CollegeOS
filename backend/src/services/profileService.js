/**
 * Profile Service
 * Business logic for profile management operations
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');
const EligibilityAutoFulfillService = require('./eligibilityAutoFulfillService');

// ==========================================
// PROFILE COMPLETION CONFIGURATION
// ==========================================

// Weight percentages for profile completion calculation
const CRITICAL_WEIGHT = 70; // Critical fields account for 70% of completion
const OPTIONAL_WEIGHT = 30; // Optional fields account for 30% of completion

// ==========================================
// CRITICAL FIELDS FOR COMPLETION CALCULATION
// ==========================================
const CRITICAL_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'email', label: 'Email' },
  { key: 'curriculum_type', label: 'Curriculum Type' },
  { key: 'country', label: 'Country' },
  { key: 'graduation_year', label: 'Graduation Year' }
];

const OPTIONAL_FIELDS = [
  { key: 'phone', label: 'Phone Number' },
  { key: 'date_of_birth', label: 'Date of Birth' },
  { key: 'gpa_weighted', label: 'GPA (Weighted)' },
  { key: 'gpa_unweighted', label: 'GPA (Unweighted)' },
  { key: 'sat_total', label: 'SAT Score' },
  { key: 'act_composite', label: 'ACT Score' },
  { key: 'ielts_score', label: 'IELTS Score' },
  { key: 'toefl_score', label: 'TOEFL Score' },
  { key: 'high_school_name', label: 'School Name' },
  { key: 'preferred_college_size', label: 'College Size Preference' },
  { key: 'preferred_setting', label: 'Campus Setting Preference' }
];

class ProfileService {
  /**
   * Get complete profile by user ID
   * @param {number} userId - User ID
   * @returns {Object} Complete profile with all data
   */
  static getCompleteProfile(userId) {
    const db = dbManager.getDatabase();
    
    // Get basic user info
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Get student profile
    const profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId);
    
    // Get activities
    let activities = [];
    if (profile) {
      activities = db.prepare(`
        SELECT * FROM student_activities 
        WHERE student_id = ? 
        ORDER BY display_order ASC
      `).all(profile.id);
    }
    
    // Parse JSON fields
    const result = {
      user: {
        ...user,
        target_countries: this.safeParseJSON(user.target_countries, []),
        intended_majors: this.safeParseJSON(user.intended_majors, []),
        test_status: this.safeParseJSON(user.test_status, {}),
        language_preferences: this.safeParseJSON(user.language_preferences, [])
      },
      profile: profile ? {
        ...profile,
        subjects: this.safeParseJSON(profile.subjects, []),
        ib_subjects: this.safeParseJSON(profile.ib_subjects, []),
        a_level_subjects: this.safeParseJSON(profile.a_level_subjects, []),
        cbse_subjects: this.safeParseJSON(profile.cbse_subjects, []),
        as_levels: this.safeParseJSON(profile.as_levels, []),
        legacy_schools: this.safeParseJSON(profile.legacy_schools, []),
        intended_majors: this.safeParseJSON(profile.intended_majors, []),
        preferred_states: this.safeParseJSON(profile.preferred_states, []),
        preferred_countries: this.safeParseJSON(profile.preferred_countries, []),
        hooks: this.safeParseJSON(profile.hooks, []),
        sat_breakdown: this.safeParseJSON(profile.sat_breakdown, null),
        act_breakdown: this.safeParseJSON(profile.act_breakdown, null),
        ielts_breakdown: this.safeParseJSON(profile.ielts_breakdown, null),
        onboarding_draft: this.safeParseJSON(profile.onboarding_draft, null)
      } : null,
      activities: activities
    };
    
    return result;
  }
  
  /**
   * Update basic info
   * @param {number} userId - User ID
   * @param {Object} data - Basic info data
   * @returns {Object} Updated profile
   */
  static updateBasicInfo(userId, data) {
    const db = dbManager.getDatabase();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Ensure profile exists
    this.ensureProfileExists(userId);
    
    // Build update query for student_profiles
    const fields = [];
    const values = [];
    
    const fieldMap = {
      first_name: 'first_name',
      firstName: 'first_name',
      last_name: 'last_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      country: 'country',
      date_of_birth: 'date_of_birth',
      dateOfBirth: 'date_of_birth',
      grade_level: 'grade_level',
      gradeLevel: 'grade_level',
      graduation_year: 'graduation_year',
      graduationYear: 'graduation_year'
    };
    
    for (const [inputKey, dbKey] of Object.entries(fieldMap)) {
      if (data[inputKey] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(data[inputKey]);
      }
    }
    
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const stmt = db.prepare(`
        UPDATE student_profiles 
        SET ${fields.join(', ')}
        WHERE user_id = ?
      `);
      stmt.run(...values);
    }
    
    // Update user table fields (full_name, country)
    if (data.first_name || data.firstName || data.last_name || data.lastName) {
      const profile = db.prepare('SELECT first_name, last_name FROM student_profiles WHERE user_id = ?').get(userId);
      const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
      if (fullName) {
        db.prepare('UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(fullName, userId);
      }
    }
    
    if (data.country) {
      db.prepare('UPDATE users SET country = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(data.country, userId);
    }
    
    // Recalculate completion percentage
    this.updateCompletionPercentage(userId);
    
    return this.getCompleteProfile(userId);
  }
  
  /**
   * Update academic info
   * @param {number} userId - User ID
   * @param {Object} data - Academic info data
   * @returns {Object} Updated profile with curriculum_changed flag
   */
  static updateAcademicInfo(userId, data) {
    const db = dbManager.getDatabase();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Ensure profile exists
    this.ensureProfileExists(userId);
    
    // Check if curriculum type is changing
    const existingProfile = db.prepare('SELECT curriculum_type, subjects FROM student_profiles WHERE user_id = ?').get(userId);
    const newCurriculumType = data.curriculum_type || data.curriculumType;
    const curriculumChanged = newCurriculumType && 
                              existingProfile && 
                              existingProfile.curriculum_type && 
                              existingProfile.curriculum_type !== newCurriculumType;
    
    // If curriculum changed and subjects exist, clear them
    let subjectsCleared = false;
    if (curriculumChanged) {
      const existingSubjects = this.safeParseJSON(existingProfile.subjects, []);
      if (existingSubjects.length > 0) {
        db.prepare(`
          UPDATE student_profiles 
          SET subjects = '[]', ib_subjects = '[]', a_level_subjects = '[]', cbse_subjects = '[]'
          WHERE user_id = ?
        `).run(userId);
        subjectsCleared = true;
        logger.info(`Cleared subjects for user ${userId} due to curriculum change from ${existingProfile.curriculum_type} to ${newCurriculumType}`);
      }
    }
    
    // Build update query
    const fields = [];
    const values = [];
    
    const fieldMap = {
      curriculum_type: 'curriculum_type',
      curriculumType: 'curriculum_type',
      stream: 'stream',
      gpa: 'gpa_weighted',
      gpa_weighted: 'gpa_weighted',
      gpaWeighted: 'gpa_weighted',
      gpa_unweighted: 'gpa_unweighted',
      gpaUnweighted: 'gpa_unweighted',
      gpa_scale: 'gpa_scale',
      gpaScale: 'gpa_scale',
      class_rank: 'class_rank',
      classRank: 'class_rank',
      class_size: 'class_size',
      classSize: 'class_size',
      high_school_name: 'high_school_name',
      highSchoolName: 'high_school_name',
      school_name: 'high_school_name',
      schoolName: 'high_school_name',
      board_type: 'board_type',
      boardType: 'board_type',
      exam_board: 'exam_board',
      examBoard: 'exam_board'
    };
    
    for (const [inputKey, dbKey] of Object.entries(fieldMap)) {
      if (data[inputKey] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(data[inputKey]);
      }
    }
    
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const stmt = db.prepare(`
        UPDATE student_profiles 
        SET ${fields.join(', ')}
        WHERE user_id = ?
      `);
      stmt.run(...values);
    }
    
    // Trigger eligibility recalculation
    this.triggerEligibilityRecalculation(userId);
    
    // Recalculate completion percentage
    this.updateCompletionPercentage(userId);
    
    const result = this.getCompleteProfile(userId);
    result.curriculum_changed = curriculumChanged;
    result.subjects_cleared = subjectsCleared;
    
    return result;
  }
  
  /**
   * Update subjects
   * @param {number} userId - User ID
   * @param {Object} data - Subjects data
   * @returns {Object} Updated profile
   */
  static updateSubjects(userId, data) {
    const db = dbManager.getDatabase();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Ensure profile exists
    this.ensureProfileExists(userId);
    
    const subjects = data.subjects || [];
    const curriculumType = data.curriculum_type || data.curriculumType;
    
    // Determine which column to update based on curriculum type
    let subjectsColumn = 'subjects';
    if (curriculumType === 'IB') {
      subjectsColumn = 'ib_subjects';
    } else if (curriculumType === 'A-Level') {
      subjectsColumn = 'a_level_subjects';
    } else if (curriculumType === 'CBSE' || curriculumType === 'ICSE' || curriculumType === 'ISC') {
      subjectsColumn = 'cbse_subjects';
    }
    
    // Update subjects
    db.prepare(`
      UPDATE student_profiles 
      SET ${subjectsColumn} = ?, subjects = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(JSON.stringify(subjects), JSON.stringify(subjects), userId);
    
    // If IB, also calculate predicted total
    if (curriculumType === 'IB' && subjects.length === 6) {
      const subjectTotal = subjects.reduce((sum, s) => sum + (s.predicted_grade || s.predictedGrade || 0), 0);
      db.prepare(`
        UPDATE student_profiles 
        SET ib_predicted_score = ?
        WHERE user_id = ?
      `).run(subjectTotal, userId);
    }
    
    // Trigger eligibility recalculation
    this.triggerEligibilityRecalculation(userId);
    
    // Recalculate completion percentage
    this.updateCompletionPercentage(userId);
    
    return this.getCompleteProfile(userId);
  }
  
  /**
   * Update test scores
   * @param {number} userId - User ID
   * @param {Object} data - Test scores data
   * @returns {Object} Updated profile
   */
  static updateTestScores(userId, data) {
    const db = dbManager.getDatabase();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Ensure profile exists
    this.ensureProfileExists(userId);
    
    // Build update query
    const fields = [];
    const values = [];
    
    const fieldMap = {
      sat_total: 'sat_total',
      satTotal: 'sat_total',
      sat_ebrw: 'sat_ebrw',
      satEbrw: 'sat_ebrw',
      sat_math: 'sat_math',
      satMath: 'sat_math',
      act_composite: 'act_composite',
      actComposite: 'act_composite',
      act_english: 'act_english',
      actEnglish: 'act_english',
      act_math: 'act_math',
      actMath: 'act_math',
      act_reading: 'act_reading',
      actReading: 'act_reading',
      act_science: 'act_science',
      actScience: 'act_science',
      ielts_score: 'ielts_score',
      ieltsScore: 'ielts_score',
      toefl_score: 'toefl_score',
      toeflScore: 'toefl_score',
      duolingo_score: 'duolingo_score',
      duolingoScore: 'duolingo_score',
      ib_predicted_score: 'ib_predicted_score',
      ibPredictedScore: 'ib_predicted_score',
      tok_grade: 'tok_grade',
      tokGrade: 'tok_grade',
      ee_grade: 'ee_grade',
      eeGrade: 'ee_grade'
    };
    
    for (const [inputKey, dbKey] of Object.entries(fieldMap)) {
      if (data[inputKey] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(data[inputKey]);
      }
    }
    
    // Handle breakdowns as JSON
    if (data.ielts_breakdown || data.ieltsBreakdown) {
      fields.push('ielts_breakdown = ?');
      values.push(JSON.stringify(data.ielts_breakdown || data.ieltsBreakdown));
    }
    
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const stmt = db.prepare(`
        UPDATE student_profiles 
        SET ${fields.join(', ')}
        WHERE user_id = ?
      `);
      stmt.run(...values);
    }
    
    // Also update user's test_status
    const testStatus = {};
    if (data.sat_total || data.satTotal) {
      testStatus.sat = { taken: true, score: data.sat_total || data.satTotal };
    }
    if (data.act_composite || data.actComposite) {
      testStatus.act = { taken: true, score: data.act_composite || data.actComposite };
    }
    if (data.ielts_score || data.ieltsScore) {
      testStatus.ielts = { taken: true, score: data.ielts_score || data.ieltsScore };
    }
    if (data.toefl_score || data.toeflScore) {
      testStatus.toefl = { taken: true, score: data.toefl_score || data.toeflScore };
    }
    
    if (Object.keys(testStatus).length > 0) {
      // Merge with existing test status
      const existingUser = db.prepare('SELECT test_status FROM users WHERE id = ?').get(userId);
      const existingTestStatus = this.safeParseJSON(existingUser?.test_status, {});
      const mergedTestStatus = { ...existingTestStatus, ...testStatus };
      
      db.prepare('UPDATE users SET test_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(mergedTestStatus), userId);
    }
    
    // Trigger eligibility recalculation
    this.triggerEligibilityRecalculation(userId);
    
    // Recalculate completion percentage
    this.updateCompletionPercentage(userId);
    
    return this.getCompleteProfile(userId);
  }
  
  /**
   * Update activities array
   * @param {number} userId - User ID
   * @param {Object} data - Activities data
   * @returns {Object} Updated profile
   */
  static updateActivities(userId, data) {
    const db = dbManager.getDatabase();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Ensure profile exists
    const profile = this.ensureProfileExists(userId);
    
    const activities = data.activities || [];
    
    // Delete existing activities for this profile
    db.prepare('DELETE FROM student_activities WHERE student_id = ?').run(profile.id);
    
    // Insert new activities
    const insertStmt = db.prepare(`
      INSERT INTO student_activities (
        student_id, activity_name, activity_type, position_title, organization_name,
        description, grade_9, grade_10, grade_11, grade_12,
        hours_per_week, weeks_per_year, total_hours, tier_rating,
        awards_recognition, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    activities.forEach((activity, index) => {
      const hoursPerWeek = activity.hours_per_week || activity.hoursPerWeek || 0;
      const weeksPerYear = activity.weeks_per_year || activity.weeksPerYear || 0;
      const totalHours = hoursPerWeek * weeksPerYear;
      
      insertStmt.run(
        profile.id,
        activity.activity_name || activity.activityName || activity.name,
        activity.activity_type || activity.activityType || activity.type,
        activity.position_title || activity.positionTitle || null,
        activity.organization_name || activity.organizationName || null,
        activity.description || null,
        activity.grade_9 ? 1 : 0,
        activity.grade_10 ? 1 : 0,
        activity.grade_11 ? 1 : 0,
        activity.grade_12 ? 1 : 0,
        hoursPerWeek,
        weeksPerYear,
        totalHours,
        activity.tier_rating || activity.tierRating || 4,
        activity.awards_recognition || activity.awardsRecognition || null,
        index + 1
      );
    });
    
    // Recalculate completion percentage
    this.updateCompletionPercentage(userId);
    
    return this.getCompleteProfile(userId);
  }
  
  /**
   * Delete specific activity
   * @param {number} userId - User ID
   * @param {number} activityId - Activity ID
   * @returns {Object} Updated profile
   */
  static deleteActivity(userId, activityId) {
    const db = dbManager.getDatabase();
    
    // Get profile
    const profile = db.prepare('SELECT id FROM student_profiles WHERE user_id = ?').get(userId);
    if (!profile) {
      throw new Error('Profile not found');
    }
    
    // Check activity exists and belongs to user
    const activity = db.prepare('SELECT id FROM student_activities WHERE id = ? AND student_id = ?')
      .get(activityId, profile.id);
    if (!activity) {
      throw new Error('Activity not found');
    }
    
    // Delete activity
    db.prepare('DELETE FROM student_activities WHERE id = ?').run(activityId);
    
    // Recalculate completion percentage
    this.updateCompletionPercentage(userId);
    
    return this.getCompleteProfile(userId);
  }
  
  /**
   * Update preferences
   * @param {number} userId - User ID
   * @param {Object} data - Preferences data
   * @returns {Object} Updated profile
   */
  static updatePreferences(userId, data) {
    const db = dbManager.getDatabase();
    
    // Check user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Ensure profile exists
    this.ensureProfileExists(userId);
    
    // Build update query for student_profiles
    const fields = [];
    const values = [];
    
    // Array fields need JSON stringify
    const arrayFields = {
      intended_majors: 'intended_majors',
      intendedMajors: 'intended_majors',
      preferred_majors: 'intended_majors',
      preferredMajors: 'intended_majors',
      preferred_locations: 'preferred_states',
      preferredLocations: 'preferred_states',
      preferred_states: 'preferred_states',
      preferredStates: 'preferred_states',
      preferred_countries: 'preferred_countries',
      preferredCountries: 'preferred_countries'
    };
    
    for (const [inputKey, dbKey] of Object.entries(arrayFields)) {
      if (data[inputKey] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(JSON.stringify(data[inputKey]));
      }
    }
    
    // Scalar fields
    const scalarFields = {
      budget_min: 'budget_min',
      budgetMin: 'budget_min',
      budget_max: 'budget_max',
      budgetMax: 'budget_max',
      college_size_preference: 'preferred_college_size',
      collegeSizePreference: 'preferred_college_size',
      preferred_college_size: 'preferred_college_size',
      preferredCollegeSize: 'preferred_college_size',
      campus_setting_preference: 'preferred_setting',
      campusSettingPreference: 'preferred_setting',
      preferred_setting: 'preferred_setting',
      preferredSetting: 'preferred_setting'
    };
    
    for (const [inputKey, dbKey] of Object.entries(scalarFields)) {
      if (data[inputKey] !== undefined) {
        fields.push(`${dbKey} = ?`);
        values.push(data[inputKey]);
      }
    }
    
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const stmt = db.prepare(`
        UPDATE student_profiles 
        SET ${fields.join(', ')}
        WHERE user_id = ?
      `);
      stmt.run(...values);
    }
    
    // Also update users table
    if (data.intended_majors || data.intendedMajors || data.preferred_majors || data.preferredMajors) {
      const majors = data.intended_majors || data.intendedMajors || data.preferred_majors || data.preferredMajors;
      db.prepare('UPDATE users SET intended_majors = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(majors), userId);
    }
    
    if (data.preferred_countries || data.preferredCountries) {
      const countries = data.preferred_countries || data.preferredCountries;
      db.prepare('UPDATE users SET target_countries = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(countries), userId);
    }
    
    // Recalculate completion percentage
    this.updateCompletionPercentage(userId);
    
    return this.getCompleteProfile(userId);
  }
  
  /**
   * Get profile completion status
   * @param {number} userId - User ID
   * @returns {Object} Completion status with percentage and missing fields
   */
  static getCompletionStatus(userId) {
    const db = dbManager.getDatabase();
    
    // Get profile
    const profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId);
    if (!profile) {
      return {
        percentage: 0,
        missing_critical: CRITICAL_FIELDS.map(f => f.label),
        missing_optional: OPTIONAL_FIELDS.map(f => f.label),
        has_subjects: false,
        has_activities: false
      };
    }
    
    // Check critical fields
    const missingCritical = [];
    let filledCritical = 0;
    
    for (const field of CRITICAL_FIELDS) {
      if (profile[field.key] && profile[field.key] !== '' && profile[field.key] !== null) {
        filledCritical++;
      } else {
        missingCritical.push(field.label);
      }
    }
    
    // Check subjects (counts as critical)
    const subjects = this.safeParseJSON(profile.subjects, []);
    const hasSubjects = subjects.length > 0;
    if (hasSubjects) {
      filledCritical++;
    } else {
      missingCritical.push('Subjects');
    }
    
    const totalCritical = CRITICAL_FIELDS.length + 1; // +1 for subjects
    
    // Check optional fields
    const missingOptional = [];
    let filledOptional = 0;
    
    for (const field of OPTIONAL_FIELDS) {
      if (profile[field.key] && profile[field.key] !== '' && profile[field.key] !== null) {
        filledOptional++;
      } else {
        missingOptional.push(field.label);
      }
    }
    
    // Check activities (counts as optional)
    const activities = db.prepare('SELECT COUNT(*) as count FROM student_activities WHERE student_id = ?')
      .get(profile.id);
    const hasActivities = activities.count > 0;
    if (hasActivities) {
      filledOptional++;
    } else {
      missingOptional.push('Activities');
    }
    
    const totalOptional = OPTIONAL_FIELDS.length + 1; // +1 for activities
    
    // Calculate percentage using defined weights
    const criticalPercentage = (filledCritical / totalCritical) * CRITICAL_WEIGHT;
    const optionalPercentage = (filledOptional / totalOptional) * OPTIONAL_WEIGHT;
    const percentage = Math.round(criticalPercentage + optionalPercentage);
    
    return {
      percentage,
      missing_critical: missingCritical,
      missing_optional: missingOptional,
      has_subjects: hasSubjects,
      has_activities: hasActivities,
      filled_critical: filledCritical,
      total_critical: totalCritical,
      filled_optional: filledOptional,
      total_optional: totalOptional
    };
  }
  
  /**
   * Save onboarding draft
   * @param {number} userId - User ID
   * @param {Object} data - Draft data
   * @returns {Object} Success status
   */
  static saveOnboardingDraft(userId, data) {
    const db = dbManager.getDatabase();
    
    // Ensure profile exists
    this.ensureProfileExists(userId);
    
    db.prepare(`
      UPDATE student_profiles 
      SET onboarding_draft = ?, onboarding_step = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(JSON.stringify(data.draft), data.step || 0, userId);
    
    return { success: true };
  }
  
  /**
   * Get onboarding draft
   * @param {number} userId - User ID
   * @returns {Object} Draft data
   */
  static getOnboardingDraft(userId) {
    const db = dbManager.getDatabase();
    
    const profile = db.prepare('SELECT onboarding_draft, onboarding_step FROM student_profiles WHERE user_id = ?')
      .get(userId);
    
    if (!profile) {
      return { draft: null, step: 0 };
    }
    
    return {
      draft: this.safeParseJSON(profile.onboarding_draft, null),
      step: profile.onboarding_step || 0
    };
  }
  
  // ==========================================
  // HELPER METHODS
  // ==========================================
  
  /**
   * Ensure profile exists for user
   * @param {number} userId - User ID
   * @returns {Object} Profile
   */
  static ensureProfileExists(userId) {
    const db = dbManager.getDatabase();
    
    let profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId);
    
    if (!profile) {
      // Create new profile
      const user = db.prepare('SELECT email, full_name, country FROM users WHERE id = ?').get(userId);
      
      const nameParts = (user?.full_name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      db.prepare(`
        INSERT INTO student_profiles (user_id, first_name, last_name, email, country)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, firstName, lastName, user?.email, user?.country);
      
      profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId);
    }
    
    return profile;
  }
  
  /**
   * Trigger eligibility recalculation
   * @param {number} userId - User ID
   */
  static triggerEligibilityRecalculation(userId) {
    try {
      const profile = this.getCompleteProfile(userId);
      if (profile && profile.profile) {
        const eligibility = EligibilityAutoFulfillService.checkAutoFulfillments(profile.profile);
        logger.debug(`Eligibility recalculated for user ${userId}:`, eligibility);
      }
    } catch (error) {
      logger.warn(`Failed to recalculate eligibility for user ${userId}:`, error.message);
    }
  }
  
  /**
   * Update profile completion percentage
   * @param {number} userId - User ID
   */
  static updateCompletionPercentage(userId) {
    const db = dbManager.getDatabase();
    const status = this.getCompletionStatus(userId);
    
    db.prepare(`
      UPDATE student_profiles 
      SET profile_completion_percentage = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(status.percentage, userId);
  }
  
  /**
   * Safe JSON parse helper
   * @param {string} jsonString - JSON string to parse
   * @param {any} fallback - Fallback value
   * @returns {any} Parsed value or fallback
   */
  static safeParseJSON(jsonString, fallback) {
    if (!jsonString || jsonString === 'undefined' || jsonString === 'null') {
      return fallback;
    }
    try {
      return JSON.parse(jsonString);
    } catch {
      return fallback;
    }
  }
}

module.exports = ProfileService;
