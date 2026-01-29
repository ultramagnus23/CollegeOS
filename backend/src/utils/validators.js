const Joi = require('joi');
const { COUNTRIES, APPLICATION_STATUS, ESSAY_STATUS } = require('../config/constants');

const validators = {
  // User registration
  registerUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    fullName: Joi.string().min(2).max(100).required(),
    country: Joi.string().valid(...COUNTRIES).required()
  }),
  
  // User login
  loginUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  
  // Onboarding
  onboarding: Joi.object({
    targetCountries: Joi.array().items(Joi.string().valid(...COUNTRIES)).min(1).required(),
    intendedMajors: Joi.array().items(Joi.string()).min(1).required(),
    testStatus: Joi.object({
      sat: Joi.object({ taken: Joi.boolean(), score: Joi.number().optional() }).optional(),
      act: Joi.object({ taken: Joi.boolean(), score: Joi.number().optional() }).optional(),
      ielts: Joi.object({ taken: Joi.boolean(), score: Joi.number().optional() }).optional(),
      toefl: Joi.object({ taken: Joi.boolean(), score: Joi.number().optional() }).optional()
    }).required(),
    languagePreferences: Joi.array().items(Joi.string()).required()
  }),
  
  // Create application
  createApplication: Joi.object({
    collegeId: Joi.number().integer().positive().optional(),
    college_id: Joi.number().integer().positive().optional(),
    applicationType: Joi.string().optional(),
    application_type: Joi.string().optional(),
    priority: Joi.string().valid('reach', 'target', 'safety').optional(),
    notes: Joi.string().max(1000).optional()
  }).or('collegeId', 'college_id'),
  
  // Update application
  updateApplication: Joi.object({
    status: Joi.string().valid(...Object.values(APPLICATION_STATUS)).optional(),
    applicationType: Joi.string().optional(),
    priority: Joi.string().valid('reach', 'target', 'safety').optional(),
    notes: Joi.string().max(1000).optional(),
    submittedAt: Joi.date().optional(),
    decisionReceivedAt: Joi.date().optional()
  }),
  
  // Create deadline
  createDeadline: Joi.object({
    applicationId: Joi.number().integer().positive().required(),
    deadlineType: Joi.string().required(),
    deadlineDate: Joi.date().required(),
    description: Joi.string().max(500).optional(),
    sourceUrl: Joi.string().uri().optional()
  }),
  
  // Create essay
  createEssay: Joi.object({
    applicationId: Joi.number().integer().positive().required(),
    essayType: Joi.string().required(),
    prompt: Joi.string().max(2000).required(),
    wordLimit: Joi.number().integer().positive().optional(),
    googleDriveLink: Joi.string().uri().optional(),
    notes: Joi.string().max(1000).optional()
  }),
  
  // Update essay
  updateEssay: Joi.object({
    googleDriveLink: Joi.string().uri().optional(),
    status: Joi.string().valid(...Object.values(ESSAY_STATUS)).optional(),
    notes: Joi.string().max(1000).optional()
  })
};

module.exports = validators;