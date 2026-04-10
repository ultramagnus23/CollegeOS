const Joi = require('joi');
const { COUNTRIES, APPLICATION_STATUS, ESSAY_STATUS } = require('../config/constants');
const securityConfig = require('../config/security');

// Custom password validation with security requirements
const passwordSchema = Joi.string()
  .min(securityConfig.password.minLength)
  .max(securityConfig.password.maxLength)
  .pattern(securityConfig.password.pattern)
  .message(securityConfig.password.message);

// Email with stricter validation
const emailSchema = Joi.string()
  .email({ tlds: { allow: true } })
  .lowercase()
  .max(254)
  .required();

const validators = {
  // User registration with strong password requirements
  registerUser: Joi.object({
    email: emailSchema,
    password: passwordSchema.required(),
    fullName: Joi.string()
      .trim()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s'-]+$/) // Only allow letters, spaces, hyphens, apostrophes
      .required(),
    country: Joi.string().trim().valid(...COUNTRIES).required()
  }),
  
  // User login
  loginUser: Joi.object({
    email: emailSchema,
    password: Joi.string().required()
  }),
  
  // Onboarding
  onboarding: Joi.object({
    target_countries: Joi.array().items(
      Joi.string().trim().custom((value, helpers) => {
        const match = COUNTRIES.find(c => c.toLowerCase() === value.toLowerCase());
        if (!match) return helpers.error('any.only');
        return match;
      }).messages({ 'any.only': `"target_countries" must be one of ${COUNTRIES.join(', ')}` })
    ).min(1).required(),
    intended_majors: Joi.array().items(Joi.string().trim()).min(1).required(),
    test_status: Joi.object({
      sat_score: Joi.number().options({ convert: true }).min(400).max(1600).optional().allow(null),
      act_score: Joi.number().options({ convert: true }).min(1).max(36).optional().allow(null),
      ib_predicted: Joi.number().options({ convert: true }).min(0).max(45).optional().allow(null)
    }).optional(),
    gpa: Joi.number().options({ convert: true }).when('gpa_type', {
      is: 'gpa',
      then: Joi.number().options({ convert: true }).min(0).max(4.0),
      otherwise: Joi.number().options({ convert: true }).min(0).max(100),
    }).optional().allow(null),
    gpa_type: Joi.string().valid('gpa', 'percentage').optional().allow(null),
    subjects: Joi.array().items(Joi.any()).optional(),
    activities: Joi.array().items(Joi.any()).optional(),
    language_preferences: Joi.array().items(Joi.string().trim()).optional()
  }),
  
  // Create application
  createApplication: Joi.object({
    collegeId: Joi.number().options({ convert: true }).integer().positive().optional(),
    college_id: Joi.number().options({ convert: true }).integer().positive().optional(),
    applicationType: Joi.string().trim().optional(),
    application_type: Joi.string().trim().optional(),
    priority: Joi.string().trim().valid('reach', 'target', 'safety').optional(),
    notes: Joi.string().trim().max(1000).optional()
  }).or('collegeId', 'college_id'),
  
  // Update application
  updateApplication: Joi.object({
    status: Joi.string().trim().valid(...Object.values(APPLICATION_STATUS)).optional(),
    applicationType: Joi.string().trim().optional(),
    priority: Joi.string().trim().valid('reach', 'target', 'safety').optional(),
    notes: Joi.string().trim().max(1000).optional(),
    submittedAt: Joi.date().optional(),
    decisionReceivedAt: Joi.date().optional()
  }),
  
  // Create deadline
  createDeadline: Joi.object({
    applicationId: Joi.number().options({ convert: true }).integer().positive().required(),
    deadlineType: Joi.string().trim().required(),
    deadlineDate: Joi.date().required(),
    description: Joi.string().trim().max(500).optional(),
    sourceUrl: Joi.string().uri().optional()
  }),
  
  // Create essay
  createEssay: Joi.object({
    applicationId: Joi.number().options({ convert: true }).integer().positive().required(),
    essayType: Joi.string().trim().required(),
    prompt: Joi.string().trim().max(2000).required(),
    wordLimit: Joi.number().options({ convert: true }).integer().positive().optional(),
    googleDriveLink: Joi.string().uri().optional(),
    notes: Joi.string().trim().max(1000).optional()
  }),
  
  // Update essay
  updateEssay: Joi.object({
    googleDriveLink: Joi.string().uri().optional(),
    status: Joi.string().trim().valid(...Object.values(ESSAY_STATUS)).optional(),
    notes: Joi.string().trim().max(1000).optional()
  })
};

module.exports = validators;