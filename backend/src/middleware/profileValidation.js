/**
 * Profile Validation Middleware
 * Validates profile data for all update types
 */

const Joi = require('joi');
const logger = require('../utils/logger');

// ==========================================
// VALIDATION CONSTANTS
// ==========================================

// Dynamic graduation year range (current year - 4 to current year + 10)
const currentYear = new Date().getFullYear();
const MIN_GRADUATION_YEAR = currentYear - 4;
const MAX_GRADUATION_YEAR = currentYear + 10;

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

// Basic Info Schema - allow empty strings for all optional fields
const basicInfoSchema = Joi.object({
  first_name: Joi.string().min(2).max(100).optional().allow('', null),
  last_name: Joi.string().min(2).max(100).optional().allow('', null),
  firstName: Joi.string().min(2).max(100).optional().allow('', null),
  lastName: Joi.string().min(2).max(100).optional().allow('', null),
  email: Joi.string().email().optional().allow('', null),
  phone: Joi.string().pattern(/^[\d\s+\-()]+$/).max(20).optional().allow('', null),
  country: Joi.string().max(100).optional().allow('', null),
  date_of_birth: Joi.alternatives().try(
    Joi.date().max('now'),
    Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
  ).optional().allow('', null),
  dateOfBirth: Joi.alternatives().try(
    Joi.date().max('now'),
    Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
  ).optional().allow('', null),
  grade_level: Joi.string().valid(
    'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 
    'Freshman', 'Sophomore', 'Junior', 'Senior',
    'Gap Year', 'College Freshman'
  ).optional().allow('', null),
  gradeLevel: Joi.string().valid(
    'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 
    'Freshman', 'Sophomore', 'Junior', 'Senior',
    'Gap Year', 'College Freshman'
  ).optional().allow('', null),
  graduation_year: Joi.number().integer().min(MIN_GRADUATION_YEAR).max(MAX_GRADUATION_YEAR).optional().allow(null),
  graduationYear: Joi.number().integer().min(MIN_GRADUATION_YEAR).max(MAX_GRADUATION_YEAR).optional().allow(null)
}).options({ stripUnknown: true });

// Academic Info Schema - allow empty strings for all optional fields
// Note: GPA validation is done at the schema level with max values for each scale type.
// Stream is optional for all curriculum types during partial updates; completeness is checked elsewhere.
const academicInfoSchema = Joi.object({
  curriculum_type: Joi.string().valid(
    'IB', 'A-Level', 'CBSE', 'ICSE', 'ISC', 'State Board',
    'AP', 'US', 'IGCSE', 'Cambridge', 'Other'
  ).optional().allow('', null),
  curriculumType: Joi.string().valid(
    'IB', 'A-Level', 'CBSE', 'ICSE', 'ISC', 'State Board',
    'AP', 'US', 'IGCSE', 'Cambridge', 'Other'
  ).optional().allow('', null),
  stream: Joi.string().valid(
    'Science with Medical', 'Science without Medical', 
    'Commerce', 'Humanities/Arts'
  ).optional().allow('', null),
  // GPA validation: Allow any reasonable GPA value (0-100 covers all scales)
  // The max values for weighted/unweighted are set based on US standards
  gpa: Joi.number().min(0).max(100).optional().allow(null),
  gpaWeighted: Joi.number().min(0).max(5.0).optional().allow(null),
  gpaUnweighted: Joi.number().min(0).max(4.0).optional().allow(null),
  gpa_weighted: Joi.number().min(0).max(5.0).optional().allow(null),
  gpa_unweighted: Joi.number().min(0).max(4.0).optional().allow(null),
  gpa_scale: Joi.number().valid(4.0, 5.0, 10.0, 100).optional().allow(null),
  gpaScale: Joi.number().valid(4.0, 5.0, 10.0, 100).optional().allow(null),
  class_rank: Joi.number().integer().min(1).optional().allow(null),
  classRank: Joi.number().integer().min(1).optional().allow(null),
  class_size: Joi.number().integer().min(1).optional().allow(null),
  classSize: Joi.number().integer().min(1).optional().allow(null),
  high_school_name: Joi.string().max(255).optional().allow('', null),
  highSchoolName: Joi.string().max(255).optional().allow('', null),
  school_name: Joi.string().max(255).optional().allow('', null),
  schoolName: Joi.string().max(255).optional().allow('', null),
  board_type: Joi.string().optional().allow('', null),
  boardType: Joi.string().optional().allow('', null),
  exam_board: Joi.string().valid(
    'Cambridge International (CIE)', 'Edexcel Pearson', 
    'AQA', 'OCR', 'Other'
  ).optional().allow('', null),
  examBoard: Joi.string().valid(
    'Cambridge International (CIE)', 'Edexcel Pearson', 
    'AQA', 'OCR', 'Other'
  ).optional().allow('', null)
}).custom((value, helpers) => {
  // Custom validation: Check GPA doesn't exceed the scale if both are provided
  const gpa = value.gpa;
  const gpaScale = value.gpa_scale || value.gpaScale;
  
  if (gpa !== null && gpa !== undefined && gpaScale !== null && gpaScale !== undefined) {
    if (gpa > gpaScale) {
      return helpers.error('any.custom', { 
        message: `GPA (${gpa}) cannot exceed GPA scale (${gpaScale})` 
      });
    }
  }
  
  return value;
}).options({ stripUnknown: true });

// IB Subject Schema
const ibSubjectSchema = Joi.object({
  subject_name: Joi.string().required(),
  subjectName: Joi.string().optional(),
  group: Joi.number().integer().min(1).max(6).required(),
  level: Joi.string().valid('HL', 'SL').required(),
  predicted_grade: Joi.number().integer().min(1).max(7).optional(),
  predictedGrade: Joi.number().integer().min(1).max(7).optional()
});

// A-Level Subject Schema
const aLevelSubjectSchema = Joi.object({
  subject_name: Joi.string().required(),
  subjectName: Joi.string().optional(),
  predicted_grade: Joi.string().valid('A*', 'A', 'B', 'C', 'D', 'E', 'U').optional(),
  predictedGrade: Joi.string().valid('A*', 'A', 'B', 'C', 'D', 'E', 'U').optional(),
  final_grade: Joi.string().valid('A*', 'A', 'B', 'C', 'D', 'E', 'U').optional(),
  finalGrade: Joi.string().valid('A*', 'A', 'B', 'C', 'D', 'E', 'U').optional(),
  exam_board: Joi.string().optional(),
  examBoard: Joi.string().optional(),
  year: Joi.string().valid('AS', 'A2').optional()
});

// CBSE Subject Schema
const cbseSubjectSchema = Joi.object({
  subject_name: Joi.string().required(),
  subjectName: Joi.string().optional(),
  stream: Joi.string().optional(),
  class_11_marks: Joi.number().min(0).max(100).optional(),
  class11Marks: Joi.number().min(0).max(100).optional(),
  class_12_marks: Joi.number().min(0).max(100).optional(),
  class12Marks: Joi.number().min(0).max(100).optional()
});

// Subjects Schema (curriculum-specific)
const subjectsSchema = Joi.object({
  curriculum_type: Joi.string().valid('IB', 'A-Level', 'CBSE', 'ICSE', 'ISC', 'Other').optional(),
  curriculumType: Joi.string().valid('IB', 'A-Level', 'CBSE', 'ICSE', 'ISC', 'Other').optional(),
  subjects: Joi.array().min(1).items(
    Joi.alternatives().try(
      ibSubjectSchema,
      aLevelSubjectSchema,
      cbseSubjectSchema,
      Joi.object().pattern(Joi.string(), Joi.any()) // Generic fallback
    )
  ).required()
}).options({ stripUnknown: true });

// Test Scores Schema
const testScoresSchema = Joi.object({
  // SAT
  sat_total: Joi.number().integer().min(400).max(1600).optional().allow(null),
  satTotal: Joi.number().integer().min(400).max(1600).optional().allow(null),
  sat_ebrw: Joi.number().integer().min(200).max(800).optional().allow(null),
  satEbrw: Joi.number().integer().min(200).max(800).optional().allow(null),
  sat_math: Joi.number().integer().min(200).max(800).optional().allow(null),
  satMath: Joi.number().integer().min(200).max(800).optional().allow(null),
  
  // ACT
  act_composite: Joi.number().integer().min(1).max(36).optional().allow(null),
  actComposite: Joi.number().integer().min(1).max(36).optional().allow(null),
  act_english: Joi.number().integer().min(1).max(36).optional().allow(null),
  actEnglish: Joi.number().integer().min(1).max(36).optional().allow(null),
  act_math: Joi.number().integer().min(1).max(36).optional().allow(null),
  actMath: Joi.number().integer().min(1).max(36).optional().allow(null),
  act_reading: Joi.number().integer().min(1).max(36).optional().allow(null),
  actReading: Joi.number().integer().min(1).max(36).optional().allow(null),
  act_science: Joi.number().integer().min(1).max(36).optional().allow(null),
  actScience: Joi.number().integer().min(1).max(36).optional().allow(null),
  
  // IELTS
  ielts_score: Joi.number().min(0).max(9).optional().allow(null),
  ieltsScore: Joi.number().min(0).max(9).optional().allow(null),
  ielts_breakdown: Joi.object({
    listening: Joi.number().min(0).max(9).optional(),
    reading: Joi.number().min(0).max(9).optional(),
    writing: Joi.number().min(0).max(9).optional(),
    speaking: Joi.number().min(0).max(9).optional()
  }).optional().allow(null),
  ieltsBreakdown: Joi.object({
    listening: Joi.number().min(0).max(9).optional(),
    reading: Joi.number().min(0).max(9).optional(),
    writing: Joi.number().min(0).max(9).optional(),
    speaking: Joi.number().min(0).max(9).optional()
  }).optional().allow(null),
  
  // TOEFL
  toefl_score: Joi.number().integer().min(0).max(120).optional().allow(null),
  toeflScore: Joi.number().integer().min(0).max(120).optional().allow(null),
  
  // Duolingo
  duolingo_score: Joi.number().integer().min(10).max(160).optional().allow(null),
  duolingoScore: Joi.number().integer().min(10).max(160).optional().allow(null),
  
  // IB
  ib_predicted_score: Joi.number().integer().min(0).max(45).optional().allow(null),
  ibPredictedScore: Joi.number().integer().min(0).max(45).optional().allow(null),
  tok_grade: Joi.string().valid('A', 'B', 'C', 'D', 'E').optional().allow('', null),
  tokGrade: Joi.string().valid('A', 'B', 'C', 'D', 'E').optional().allow('', null),
  ee_grade: Joi.string().valid('A', 'B', 'C', 'D', 'E').optional().allow('', null),
  eeGrade: Joi.string().valid('A', 'B', 'C', 'D', 'E').optional().allow('', null)
}).options({ stripUnknown: true });

// Activities Schema
const activitySchema = Joi.object({
  activity_name: Joi.string().required(),
  activityName: Joi.string().optional(),
  name: Joi.string().optional(),
  activity_type: Joi.string().required(),
  activityType: Joi.string().optional(),
  type: Joi.string().optional(),
  position_title: Joi.string().max(100).optional(),
  positionTitle: Joi.string().max(100).optional(),
  organization_name: Joi.string().max(200).optional(),
  organizationName: Joi.string().max(200).optional(),
  description: Joi.string().max(150).optional(), // Common App limit
  hours_per_week: Joi.number().min(0).max(168).optional(), // Max hours in a week
  hoursPerWeek: Joi.number().min(0).max(168).optional(),
  weeks_per_year: Joi.number().min(0).max(52).optional(),
  weeksPerYear: Joi.number().min(0).max(52).optional(),
  grade_9: Joi.boolean().optional(),
  grade_10: Joi.boolean().optional(),
  grade_11: Joi.boolean().optional(),
  grade_12: Joi.boolean().optional(),
  tier_rating: Joi.number().integer().min(1).max(4).optional(),
  tierRating: Joi.number().integer().min(1).max(4).optional(),
  awards_recognition: Joi.string().max(500).optional(),
  awardsRecognition: Joi.string().max(500).optional()
}).custom((value, helpers) => {
  // Validate hours_per_week * weeks_per_year <= 8760 (hours in a year)
  const hoursPerWeek = value.hours_per_week || value.hoursPerWeek || 0;
  const weeksPerYear = value.weeks_per_year || value.weeksPerYear || 0;
  
  if (hoursPerWeek * weeksPerYear > 8760) {
    return helpers.error('any.custom', { message: 'Total hours per year cannot exceed 8760' });
  }
  
  return value;
});

const activitiesSchema = Joi.object({
  activities: Joi.array().items(activitySchema).required()
}).options({ stripUnknown: true });

// Preferences Schema
const preferencesSchema = Joi.object({
  intended_majors: Joi.array().items(Joi.string()).optional(),
  intendedMajors: Joi.array().items(Joi.string()).optional(),
  preferred_majors: Joi.array().items(Joi.string()).optional(),
  preferredMajors: Joi.array().items(Joi.string()).optional(),
  preferred_locations: Joi.array().items(Joi.string()).optional(),
  preferredLocations: Joi.array().items(Joi.string()).optional(),
  preferred_states: Joi.array().items(Joi.string()).optional(),
  preferredStates: Joi.array().items(Joi.string()).optional(),
  preferred_countries: Joi.array().items(Joi.string()).optional(),
  preferredCountries: Joi.array().items(Joi.string()).optional(),
  budget_min: Joi.number().integer().min(0).optional().allow(null),
  budgetMin: Joi.number().integer().min(0).optional().allow(null),
  budget_max: Joi.number().integer().min(0).optional().allow(null),
  budgetMax: Joi.number().integer().min(0).optional().allow(null),
  college_size_preference: Joi.string().valid('Small', 'Medium', 'Large', 'Any').optional(),
  collegeSizePreference: Joi.string().valid('Small', 'Medium', 'Large', 'Any').optional(),
  preferred_college_size: Joi.string().valid('Small', 'Medium', 'Large', 'Any').optional(),
  preferredCollegeSize: Joi.string().valid('Small', 'Medium', 'Large', 'Any').optional(),
  campus_setting_preference: Joi.string().valid('Urban', 'Suburban', 'Rural', 'Any').optional(),
  campusSettingPreference: Joi.string().valid('Urban', 'Suburban', 'Rural', 'Any').optional(),
  preferred_setting: Joi.string().valid('Urban', 'Suburban', 'Rural', 'Any').optional(),
  preferredSetting: Joi.string().valid('Urban', 'Suburban', 'Rural', 'Any').optional()
}).options({ stripUnknown: true });

// ==========================================
// VALIDATION MIDDLEWARE FUNCTIONS
// ==========================================

/**
 * Generic validation middleware factory
 */
const createValidationMiddleware = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Profile validation failed:', errors);

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    req.validatedData = value;
    next();
  };
};

/**
 * Validate basic info updates
 */
const validateBasicInfo = createValidationMiddleware(basicInfoSchema);

/**
 * Validate academic info updates
 */
const validateAcademicInfo = createValidationMiddleware(academicInfoSchema);

/**
 * Validate subjects updates with curriculum-specific rules
 */
const validateSubjects = (req, res, next) => {
  const { error, value } = subjectsSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    logger.warn('Subjects validation failed:', errors);

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  // Additional curriculum-specific validation
  const curriculumType = value.curriculum_type || value.curriculumType;
  const subjects = value.subjects || [];

  if (curriculumType === 'IB') {
    // IB requires 6 subjects with 3-4 at HL
    const hlCount = subjects.filter(s => s.level === 'HL').length;
    if (subjects.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'subjects', message: 'IB Diploma requires exactly 6 subjects' }]
      });
    }
    if (hlCount < 3 || hlCount > 4) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'subjects', message: 'IB Diploma requires 3 or 4 HL subjects' }]
      });
    }
  }

  if (curriculumType === 'A-Level') {
    // A-Level requires 3-4 subjects
    if (subjects.length < 3 || subjects.length > 4) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'subjects', message: 'A-Levels require 3 or 4 subjects' }]
      });
    }
  }

  req.validatedData = value;
  next();
};

/**
 * Validate test scores with SAT breakdown validation
 */
const validateTestScores = (req, res, next) => {
  const { error, value } = testScoresSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    logger.warn('Test scores validation failed:', errors);

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  // Validate SAT breakdown adds up
  const satTotal = value.sat_total || value.satTotal;
  const satEbrw = value.sat_ebrw || value.satEbrw;
  const satMath = value.sat_math || value.satMath;

  if (satTotal && satEbrw && satMath) {
    if (satEbrw + satMath !== satTotal) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: [{ 
          field: 'sat_total', 
          message: 'SAT total must equal EBRW + Math scores' 
        }]
      });
    }
  }

  req.validatedData = value;
  next();
};

/**
 * Validate activities updates
 */
const validateActivities = createValidationMiddleware(activitiesSchema);

/**
 * Validate preferences updates
 */
const validatePreferences = createValidationMiddleware(preferencesSchema);

module.exports = {
  validateBasicInfo,
  validateAcademicInfo,
  validateSubjects,
  validateTestScores,
  validateActivities,
  validatePreferences,
  // Export schemas for testing
  schemas: {
    basicInfoSchema,
    academicInfoSchema,
    subjectsSchema,
    testScoresSchema,
    activitiesSchema,
    preferencesSchema
  }
};
