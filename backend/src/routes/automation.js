/**
 * Automation Routes - API endpoints for magic automation features
 */

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const AutoDetectionService = require('../services/autoDetectionService');
const consolidatedChancingService = require('../services/consolidatedChancingService');
const College = require('../models/College');
const StudentProfile = require('../models/StudentProfile');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

// Input validation constants
const MAX_SCHOOL_NAME_LENGTH = 200;
const MAX_COUNTRIES = 10;
const MAX_MAJORS = 10;

// Interest keyword list for onboarding goal matching
const INTEREST_KEYWORDS = [
  'research', 'business', 'engineering', 'medicine', 'arts',
  'technology', 'law', 'environment', 'finance', 'design'
];

/**
 * Extract interest tags from free-text goals/motivations.
 * Returns an array of matched keywords from INTEREST_KEYWORDS.
 */
function extractInterestTags(careerGoals = '', whyCollege = '') {
  const text = `${careerGoals} ${whyCollege}`.toLowerCase();
  return INTEREST_KEYWORDS.filter(kw => text.includes(kw));
}

/**
 * Score a single college against a student profile.
 * Returns a numeric score (higher = better match).
 */
function scoreCollege(college, profile, interestTags = []) {
  let score = 0;

  // +30 if country matches preferredCountries
  const preferredCountries = (profile.preferredCountries || profile.preferred_countries || [])
    .map(c => (c || '').toLowerCase());
  if (preferredCountries.length > 0 && college.country &&
      preferredCountries.includes(college.country.toLowerCase())) {
    score += 30;
  }

  // +20 if acceptance_rate > 0.4
  const ar = parseFloat(college.acceptanceRate || college.acceptance_rate || 0);
  if (ar > 0.4) score += 20;

  // +20 if any major in college programs matches potentialMajors
  const potentialMajors = (profile.potentialMajors || profile.intendedMajors || profile.intended_majors || [])
    .map(m => (m || '').toLowerCase());
  const collegeMajors = (college.majorCategories || [])
    .map(m => (m || '').toLowerCase());
  if (potentialMajors.length > 0 && collegeMajors.some(m => potentialMajors.some(pm => m.includes(pm) || pm.includes(m)))) {
    score += 20;
  }

  // +30 based on budget vs tuition (within budget = max, over budget = 0)
  const budget = parseFloat(profile.budgetMax || profile.budget_max || 0);
  const tuition = parseFloat(college.tuitionInternational || college.tuition_international ||
                             college.tuitionDomestic || college.tuition_domestic || 0);
  if (budget > 0 && tuition > 0) {
    if (tuition <= budget) score += 30;
    else if (tuition <= budget * 1.2) score += 15;
  } else if (budget === 0 || tuition === 0) {
    score += 15; // Unknown cost, partial credit
  }

  // +15 if college description or programs contain any interest_tag
  if (interestTags.length > 0) {
    const descText = `${college.description || ''} ${(collegeMajors).join(' ')}`.toLowerCase();
    if (interestTags.some(tag => descText.includes(tag))) {
      score += 15;
    }
  }

  return score;
}

/**
 * POST /api/automation/detect-curriculum
 * Auto-detect curriculum from school name
 */
router.post('/detect-curriculum', optionalAuth, async (req, res) => {
  try {
    const { schoolName } = req.body;
    
    if (!schoolName || typeof schoolName !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'School name is required' 
      });
    }

    if (schoolName.length > MAX_SCHOOL_NAME_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'School name is too long'
      });
    }

    const result = AutoDetectionService.detectCurriculum(schoolName);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Curriculum detection failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to detect curriculum' 
    });
  }
});

/**
 * POST /api/automation/detect-country
 * Auto-detect country from location
 */
router.post('/detect-country', optionalAuth, async (req, res) => {
  try {
    const { location } = req.body;
    
    if (!location || typeof location !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Location is required' 
      });
    }

    const result = AutoDetectionService.detectCountry(location);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Country detection failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to detect country' 
    });
  }
});

/**
 * POST /api/automation/check-exemption
 * Check English proficiency test exemption
 */
router.post('/check-exemption', authenticate, async (req, res) => {
  try {
    const { profile, targetCountry } = req.body;
    
    if (!profile || !targetCountry) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile and target country are required' 
      });
    }

    const result = AutoDetectionService.checkEnglishExemption(profile, targetCountry);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Exemption check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check exemption' 
    });
  }
});

/**
 * GET /api/automation/application-system/:country
 * Get application system requirements for a country
 */
router.get('/application-system/:country', optionalAuth, async (req, res) => {
  try {
    const { country } = req.params;
    
    if (!country) {
      return res.status(400).json({ 
        success: false, 
        error: 'Country is required' 
      });
    }

    const result = AutoDetectionService.getApplicationSystem(country);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Application system lookup failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get application system' 
    });
  }
});

/**
 * POST /api/automation/recommended-actions
 * Get auto-generated recommended actions
 */
router.post('/recommended-actions', authenticate, async (req, res) => {
  try {
    const { profile } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    const actions = AutoDetectionService.generateRecommendedActions(profile);
    
    res.json({
      success: true,
      data: actions
    });
  } catch (error) {
    logger.error('Action generation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate recommended actions' 
    });
  }
});

/**
 * POST /api/automation/profile-strength
 * Calculate profile strength score
 */
router.post('/profile-strength', authenticate, async (req, res) => {
  try {
    const { profile } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    const strength = AutoDetectionService.calculateProfileStrength(profile);
    
    res.json({
      success: true,
      data: strength
    });
  } catch (error) {
    logger.error('Profile strength calculation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate profile strength' 
    });
  }
});

/**
 * POST /api/automation/college-list-strategy
 * Generate college list strategy recommendations
 */
router.post('/college-list-strategy', authenticate, async (req, res) => {
  try {
    const { profile, options } = req.body;
    
    if (!profile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Profile is required' 
      });
    }

    const strategy = AutoDetectionService.generateCollegeListStrategy(profile, options || {});
    
    res.json({
      success: true,
      data: strategy
    });
  } catch (error) {
    logger.error('Strategy generation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate strategy' 
    });
  }
});

/**
 * POST /api/automation/recommendations
 * Generate personalized college recommendations
 */
router.post('/recommendations', authenticate, async (req, res) => {
  try {
    const { profile, preferences } = req.body;

    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'Profile is required'
      });
    }

    // Validate preferences
    if (preferences) {
      if (preferences.targetCountries && preferences.targetCountries.length > MAX_COUNTRIES) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${MAX_COUNTRIES} target countries allowed`
        });
      }
      if (preferences.majors && preferences.majors.length > MAX_MAJORS) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${MAX_MAJORS} majors allowed`
        });
      }
    }

    const mergedProfile = { ...profile, ...(preferences || {}) };
    const interestTags = extractInterestTags(mergedProfile.careerGoals, mergedProfile.whyCollege);
    const allColleges = await College.findAll({ limit: 200 });
    const scored = allColleges
      .map(c => ({ ...c, _score: scoreCollege(c, mergedProfile, interestTags) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10);

    res.json({ success: true, data: scored });
  } catch (error) {
    logger.error('Recommendation generation failed:', { error: error?.message, stack: error?.stack });
    res.json({ success: true, data: [] });
  }
});

/**
 * GET /api/automation/similar-colleges/:collegeId
 * Get colleges similar to a reference college
 */
router.get('/similar-colleges/:collegeId', authenticate, async (req, res) => {
  try {
    const { collegeId } = req.params;

    if (!collegeId) {
      return res.status(400).json({
        success: false,
        error: 'College ID is required'
      });
    }

    const reference = await College.findById(parseInt(collegeId));
    if (!reference) {
      return res.json({ success: true, data: [] });
    }

    const allColleges = await College.findAll({ country: reference.country, limit: 100 });
    const similar = allColleges
      .filter(c => c.id !== reference.id)
      .map(c => ({
        ...c,
        _score: scoreCollege(c, {
          preferredCountries: [reference.country],
          intendedMajors: reference.majorCategories || [],
          budgetMax: reference.tuitionDomestic || reference.tuitionInternational || 0
        }, [])
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    res.json({ success: true, data: similar });
  } catch (error) {
    logger.error('Similar colleges lookup failed:', { error: error?.message });
    res.json({ success: true, data: [] });
  }
});

/**
 * POST /api/automation/instant-recommendations
 * Get instant recommendations after onboarding
 */
router.post('/instant-recommendations', authenticate, async (req, res) => {
  try {
    const { profile } = req.body;

    if (!profile) {
      return res.json({ success: true, data: [] });
    }

    const interestTags = extractInterestTags(
      profile.careerGoals || profile.career_goals || '',
      profile.whyCollege || profile.why_college || ''
    );

    // Build country filter from preferred countries
    const preferredCountries = profile.preferredCountries || profile.preferred_countries || [];
    const filters = { limit: 200 };
    if (preferredCountries.length === 1) {
      filters.country = preferredCountries[0];
    }

    const allColleges = await College.findAll(filters);
    const scored = allColleges
      .map(c => ({ ...c, _score: scoreCollege(c, profile, interestTags) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10);

    // Persist interest_tags, career_goals, why_college back to student profile (best-effort)
    try {
      await StudentProfile.upsert(req.user.userId, {
        interestTags,
        careerGoals: profile.careerGoals || profile.career_goals || null,
        whyCollege: profile.whyCollege || profile.why_college || null,
      });
    } catch (saveErr) {
      logger.warn('Could not persist interest_tags to profile:', { error: saveErr?.message });
    }

    logger.info('Instant recommendations generated', { userId: req.user.userId, count: scored.length });
    res.json({ success: true, data: scored });
  } catch (error) {
    logger.error('Instant recommendations failed:', { error: error?.message, stack: error?.stack });
    res.json({ success: true, data: [] });
  }
});

/**
 * POST /api/automation/behavior-suggestions
 * Get suggestions based on browsing behavior
 */
router.post('/behavior-suggestions', authenticate, async (req, res) => {
  try {
    const { viewedColleges } = req.body;

    if (!viewedColleges || !Array.isArray(viewedColleges)) {
      return res.status(400).json({
        success: false,
        error: 'Viewed colleges array is required'
      });
    }

    // Return empty suggestions as fallback
    res.json({ success: true, data: [] });
  } catch (error) {
    logger.error('Behavior suggestions failed:', { error: error?.message });
    res.json({ success: true, data: [] });
  }
});

module.exports = router;
