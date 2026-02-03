/**
 * FitClassificationService.ts
 * Core intelligence for classifying college fit based on user profile
 * Implements non-ML classification with transparent explanations
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');

/**
 * @typedef {Object} FitScore
 * @property {number} score - Score from 0-100
 * @property {string} category - 'safety', 'target', 'reach', 'unrealistic'
 * @property {Object[]} factors - Contributing factors
 */

/**
 * @typedef {Object} CollegeFit
 * @property {string} fitCategory - Overall classification
 * @property {number} overallScore - Combined score 0-100
 * @property {number} confidence - Confidence level 0-1
 * @property {FitScore} academicFit
 * @property {FitScore} profileFit
 * @property {FitScore} financialFit
 * @property {FitScore} timelineFit
 * @property {Object} explanation
 */

class FitClassificationService {
  /**
   * Default weights for fit calculation
   */
  static DEFAULT_WEIGHTS = {
    academic: 0.4,
    profile: 0.3,
    financial: 0.15,
    timeline: 0.15
  };

  /**
   * Main classifier - calculates fit for a user and college
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Promise<CollegeFit>}
   */
  static async classifyCollege(userId, collegeId) {
    try {
      const db = dbManager.getDatabase();
      
      // Get user profile
      const profile = await this.getUserProfile(userId);
      if (!profile) {
        throw new Error('User profile not found');
      }
      
      // Get college data
      const college = await this.getCollegeData(collegeId);
      if (!college) {
        throw new Error('College not found');
      }
      
      // Get user's custom weights or use defaults
      const weights = await this.getUserWeights(userId);
      
      // Calculate individual fit scores
      const academicFit = this.calculateAcademicFit(profile, college);
      const profileFit = this.calculateProfileFit(profile, college);
      const financialFit = this.calculateFinancialFit(profile, college);
      const timelineFit = await this.calculateTimelineFit(userId, collegeId);
      
      // Calculate overall weighted score
      const overallScore = (
        academicFit.score * weights.academic +
        profileFit.score * weights.profile +
        financialFit.score * weights.financial +
        timelineFit.score * weights.timeline
      );
      
      // Determine final category
      const fitCategory = this.determineCategory(overallScore, academicFit.score);
      
      // Calculate confidence based on data quality
      const confidence = this.calculateConfidence(profile, college);
      
      // Generate explanation
      const explanation = this.explainClassification({
        fitCategory,
        overallScore,
        academicFit,
        profileFit,
        financialFit,
        timelineFit,
        profile,
        college
      });
      
      // Cache the result
      await this.cacheResult(userId, collegeId, {
        fitCategory,
        overallScore,
        confidence,
        academicFit,
        profileFit,
        financialFit,
        timelineFit,
        explanation
      });
      
      logger.debug(`Classified college ${collegeId} for user ${userId}: ${fitCategory} (${overallScore.toFixed(1)})`);
      
      return {
        fitCategory,
        overallScore,
        confidence,
        academicFit,
        profileFit,
        financialFit,
        timelineFit,
        explanation
      };
    } catch (error) {
      logger.error(`Failed to classify college ${collegeId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate academic fit based on GPA, test scores, etc.
   * @param {Object} profile - User profile
   * @param {Object} college - College data
   * @returns {FitScore}
   */
  static calculateAcademicFit(profile, college) {
    const factors = [];
    let totalWeight = 0;
    let weightedScore = 0;
    
    // GPA comparison
    if (profile.gpa && college.averageGpa) {
      const normalizedUserGPA = this.normalizeGPA(profile.gpa, profile.gpaScale || '4.0');
      const gpaDiff = normalizedUserGPA - college.averageGpa;
      
      let gpaScore;
      let gpaCategory;
      
      if (gpaDiff >= 0.3) {
        gpaScore = 95;
        gpaCategory = 'safety';
      } else if (gpaDiff >= 0) {
        gpaScore = 80;
        gpaCategory = 'target';
      } else if (gpaDiff >= -0.2) {
        gpaScore = 65;
        gpaCategory = 'target';
      } else if (gpaDiff >= -0.5) {
        gpaScore = 40;
        gpaCategory = 'reach';
      } else {
        gpaScore = 20;
        gpaCategory = 'unrealistic';
      }
      
      factors.push({
        name: 'GPA',
        score: gpaScore,
        weight: 0.5,
        detail: `Your GPA (${normalizedUserGPA.toFixed(2)}) vs college average (${college.averageGpa.toFixed(2)})`,
        impact: gpaDiff >= 0 ? 'positive' : 'negative'
      });
      
      weightedScore += gpaScore * 0.5;
      totalWeight += 0.5;
    }
    
    // SAT comparison
    if (profile.satTotal && college.satRange) {
      const [satMin, satMax] = this.parseSATRange(college.satRange);
      const satMid = (satMin + satMax) / 2;
      
      let satScore;
      if (profile.satTotal >= satMax) {
        satScore = 95;
      } else if (profile.satTotal >= satMid) {
        satScore = 75;
      } else if (profile.satTotal >= satMin) {
        satScore = 55;
      } else if (profile.satTotal >= satMin - 100) {
        satScore = 35;
      } else {
        satScore = 15;
      }
      
      factors.push({
        name: 'SAT Score',
        score: satScore,
        weight: 0.3,
        detail: `Your SAT (${profile.satTotal}) vs college range (${satMin}-${satMax})`,
        impact: profile.satTotal >= satMid ? 'positive' : 'negative'
      });
      
      weightedScore += satScore * 0.3;
      totalWeight += 0.3;
    }
    
    // ACT comparison
    if (profile.actComposite && college.actRange) {
      const [actMin, actMax] = this.parseACTRange(college.actRange);
      const actMid = (actMin + actMax) / 2;
      
      let actScore;
      if (profile.actComposite >= actMax) {
        actScore = 95;
      } else if (profile.actComposite >= actMid) {
        actScore = 75;
      } else if (profile.actComposite >= actMin) {
        actScore = 55;
      } else if (profile.actComposite >= actMin - 2) {
        actScore = 35;
      } else {
        actScore = 15;
      }
      
      factors.push({
        name: 'ACT Score',
        score: actScore,
        weight: 0.2,
        detail: `Your ACT (${profile.actComposite}) vs college range (${actMin}-${actMax})`,
        impact: profile.actComposite >= actMid ? 'positive' : 'negative'
      });
      
      weightedScore += actScore * 0.2;
      totalWeight += 0.2;
    }
    
    // Normalize the score if we have data
    const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 50;
    const category = this.scoreToCategory(finalScore);
    
    return {
      score: Math.round(finalScore),
      category,
      factors
    };
  }

  /**
   * Calculate profile fit based on activities, essays, etc.
   * @param {Object} profile - User profile
   * @param {Object} college - College data
   * @returns {FitScore}
   */
  static calculateProfileFit(profile, college) {
    const factors = [];
    let totalScore = 50; // Default middle score
    
    // Activities tier rating
    if (profile.activitiesCount > 0) {
      let activityScore;
      const tierAvg = profile.avgActivityTier || 3;
      
      if (tierAvg <= 1.5) {
        activityScore = 95; // National/international level
      } else if (tierAvg <= 2.5) {
        activityScore = 75; // State/regional level
      } else if (tierAvg <= 3.5) {
        activityScore = 55; // School leadership
      } else {
        activityScore = 35; // Participation only
      }
      
      factors.push({
        name: 'Extracurricular Quality',
        score: activityScore,
        weight: 0.4,
        detail: `${profile.activitiesCount} activities with average tier ${tierAvg.toFixed(1)}`,
        impact: tierAvg <= 2.5 ? 'positive' : 'neutral'
      });
      
      totalScore = activityScore;
    }
    
    // Awards consideration
    if (profile.awardsCount > 0) {
      const awardScore = Math.min(90, 50 + profile.awardsCount * 5);
      
      factors.push({
        name: 'Awards & Recognition',
        score: awardScore,
        weight: 0.3,
        detail: `${profile.awardsCount} awards/recognitions`,
        impact: profile.awardsCount >= 3 ? 'positive' : 'neutral'
      });
      
      totalScore = (totalScore * 0.7) + (awardScore * 0.3);
    }
    
    // Major alignment
    if (profile.intendedMajors && college.majorCategories) {
      const majors = Array.isArray(profile.intendedMajors) ? profile.intendedMajors : JSON.parse(profile.intendedMajors || '[]');
      const collegeMajors = Array.isArray(college.majorCategories) ? college.majorCategories : JSON.parse(college.majorCategories || '[]');
      
      const hasMatchingMajor = majors.some(m => 
        collegeMajors.some(cm => cm.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(cm.toLowerCase()))
      );
      
      if (hasMatchingMajor) {
        factors.push({
          name: 'Major Alignment',
          score: 80,
          weight: 0.3,
          detail: 'Your intended major aligns with college offerings',
          impact: 'positive'
        });
        totalScore = (totalScore * 0.7) + (80 * 0.3);
      }
    }
    
    const category = this.scoreToCategory(totalScore);
    
    return {
      score: Math.round(totalScore),
      category,
      factors
    };
  }

  /**
   * Calculate financial fit based on budget vs costs
   * @param {Object} profile - User profile with budget info
   * @param {Object} college - College data with cost info
   * @returns {FitScore}
   */
  static calculateFinancialFit(profile, college) {
    const factors = [];
    let score = 70; // Default to moderate fit
    
    const userBudget = profile.budgetMax || profile.maxBudgetPerYear;
    const collegeCost = college.tuitionInternational || college.tuitionDomestic || college.totalCost;
    
    if (userBudget && collegeCost) {
      const affordability = userBudget / collegeCost;
      
      if (affordability >= 1.5) {
        score = 95;
        factors.push({
          name: 'Affordability',
          score: 95,
          weight: 0.7,
          detail: `Budget ($${userBudget.toLocaleString()}) comfortably covers cost ($${collegeCost.toLocaleString()})`,
          impact: 'positive'
        });
      } else if (affordability >= 1.0) {
        score = 75;
        factors.push({
          name: 'Affordability',
          score: 75,
          weight: 0.7,
          detail: `Budget ($${userBudget.toLocaleString()}) covers cost ($${collegeCost.toLocaleString()})`,
          impact: 'positive'
        });
      } else if (affordability >= 0.7) {
        score = 50;
        factors.push({
          name: 'Affordability',
          score: 50,
          weight: 0.7,
          detail: `Budget ($${userBudget.toLocaleString()}) is below cost ($${collegeCost.toLocaleString()}) - may need aid`,
          impact: 'neutral'
        });
      } else {
        score = 25;
        factors.push({
          name: 'Affordability',
          score: 25,
          weight: 0.7,
          detail: `Significant financial gap - cost ($${collegeCost.toLocaleString()}) exceeds budget ($${userBudget.toLocaleString()})`,
          impact: 'negative'
        });
      }
    }
    
    // Consider financial aid needs
    if (profile.needFinancialAid) {
      factors.push({
        name: 'Financial Aid Needed',
        score: score - 10,
        weight: 0.3,
        detail: 'You indicated financial aid is needed',
        impact: 'neutral'
      });
      score = Math.max(10, score - 10);
    }
    
    const category = this.scoreToCategory(score);
    
    return {
      score: Math.round(score),
      category,
      factors
    };
  }

  /**
   * Calculate timeline fit based on remaining time and tasks
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Promise<FitScore>}
   */
  static async calculateTimelineFit(userId, collegeId) {
    const db = dbManager.getDatabase();
    const factors = [];
    let score = 80; // Default to good fit
    
    try {
      // Get the nearest deadline for this college
      const deadline = db.prepare(`
        SELECT MIN(deadline_date) as next_deadline
        FROM user_deadlines
        WHERE user_id = ? AND college_id = ? AND is_active = 1 AND is_completed = 0
      `).get(userId, collegeId);
      
      // Get incomplete tasks for this college
      const taskStats = db.prepare(`
        SELECT 
          COUNT(*) as total_tasks,
          SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
          SUM(estimated_hours) as total_hours,
          SUM(CASE WHEN status != 'complete' THEN estimated_hours ELSE 0 END) as remaining_hours
        FROM tasks
        WHERE user_id = ? AND college_id = ?
      `).get(userId, collegeId);
      
      if (deadline && deadline.next_deadline) {
        const deadlineDate = new Date(deadline.next_deadline);
        const now = new Date();
        const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);
        const hoursNeeded = taskStats?.remaining_hours || 0;
        const buffer = hoursRemaining - hoursNeeded;
        
        if (buffer > 100) {
          score = 95;
          factors.push({
            name: 'Time Buffer',
            score: 95,
            weight: 0.6,
            detail: `${Math.round(buffer)} hours of buffer time - very comfortable`,
            impact: 'positive'
          });
        } else if (buffer > 20) {
          score = 70;
          factors.push({
            name: 'Time Buffer',
            score: 70,
            weight: 0.6,
            detail: `${Math.round(buffer)} hours of buffer time - manageable`,
            impact: 'neutral'
          });
        } else if (buffer > 0) {
          score = 40;
          factors.push({
            name: 'Time Buffer',
            score: 40,
            weight: 0.6,
            detail: `Only ${Math.round(buffer)} hours of buffer - critical`,
            impact: 'negative'
          });
        } else {
          score = 10;
          factors.push({
            name: 'Time Buffer',
            score: 10,
            weight: 0.6,
            detail: `Negative buffer (${Math.round(buffer)} hours) - may be impossible`,
            impact: 'negative'
          });
        }
      }
      
      // Consider blocked tasks
      if (taskStats && taskStats.blocked > 0) {
        score = Math.max(10, score - (taskStats.blocked * 10));
        factors.push({
          name: 'Blocked Tasks',
          score: Math.max(10, 80 - taskStats.blocked * 15),
          weight: 0.4,
          detail: `${taskStats.blocked} task(s) are currently blocked`,
          impact: 'negative'
        });
      }
    } catch (error) {
      logger.warn(`Could not calculate timeline fit for user ${userId}, college ${collegeId}:`, error.message);
      // Return default score if we can't calculate
      factors.push({
        name: 'Timeline Data',
        score: 70,
        weight: 1.0,
        detail: 'No deadline/task data available yet',
        impact: 'neutral'
      });
    }
    
    const category = this.scoreToCategory(score);
    
    return {
      score: Math.round(score),
      category,
      factors
    };
  }

  /**
   * Determine overall fit category based on score and academic fit
   * @param {number} overallScore - Overall weighted score
   * @param {number} academicScore - Academic fit score (important tiebreaker)
   * @returns {'safety' | 'target' | 'reach' | 'unrealistic'}
   */
  static determineCategory(overallScore, academicScore) {
    // Academic score is weighted heavily in final determination
    if (overallScore >= 85 && academicScore >= 80) {
      return 'safety';
    } else if (overallScore >= 60 && academicScore >= 55) {
      return 'target';
    } else if (overallScore >= 35 && academicScore >= 30) {
      return 'reach';
    } else {
      return 'unrealistic';
    }
  }

  /**
   * Convert numeric score to category
   * @param {number} score - Score 0-100
   * @returns {'safety' | 'target' | 'reach' | 'unrealistic'}
   */
  static scoreToCategory(score) {
    if (score >= 80) return 'safety';
    if (score >= 55) return 'target';
    if (score >= 30) return 'reach';
    return 'unrealistic';
  }

  /**
   * Generate human-readable explanation of the classification
   * @param {Object} data - Classification data
   * @returns {Object} Explanation object
   */
  static explainClassification(data) {
    const { fitCategory, overallScore, academicFit, profileFit, financialFit, timelineFit, college } = data;
    
    // Build summary sentence
    const categoryDescriptions = {
      safety: 'a safety school where you have strong chances of admission',
      target: 'a target school that matches your profile well',
      reach: 'a reach school where admission is competitive but possible',
      unrealistic: 'currently unrealistic based on your profile'
    };
    
    const summary = `${college.name} is ${categoryDescriptions[fitCategory]}.`;
    
    // Collect all factors
    const allFactors = [
      ...academicFit.factors.map(f => ({ ...f, category: 'Academic' })),
      ...profileFit.factors.map(f => ({ ...f, category: 'Profile' })),
      ...financialFit.factors.map(f => ({ ...f, category: 'Financial' })),
      ...timelineFit.factors.map(f => ({ ...f, category: 'Timeline' }))
    ];
    
    // Sort by impact - show positives first, then neutrals, then negatives
    const sortedFactors = allFactors.sort((a, b) => {
      const order = { positive: 0, neutral: 1, negative: 2 };
      return order[a.impact] - order[b.impact];
    });
    
    // Generate calculation steps for transparency
    const calculationSteps = [
      { step: 1, description: `Academic Fit: ${academicFit.score}/100 (weight: 40%)`, value: academicFit.score * 0.4 },
      { step: 2, description: `Profile Fit: ${profileFit.score}/100 (weight: 30%)`, value: profileFit.score * 0.3 },
      { step: 3, description: `Financial Fit: ${financialFit.score}/100 (weight: 15%)`, value: financialFit.score * 0.15 },
      { step: 4, description: `Timeline Fit: ${timelineFit.score}/100 (weight: 15%)`, value: timelineFit.score * 0.15 },
      { step: 5, description: `Overall Score: ${overallScore.toFixed(1)}/100`, value: overallScore }
    ];
    
    // Generate recommendations based on weak areas
    const recommendations = [];
    if (academicFit.score < 60) {
      recommendations.push('Consider improving test scores or GPA to strengthen academic profile');
    }
    if (profileFit.score < 60) {
      recommendations.push('Develop deeper involvement in fewer activities rather than surface-level participation');
    }
    if (financialFit.score < 60) {
      recommendations.push('Research financial aid options and scholarships at this institution');
    }
    if (timelineFit.score < 60) {
      recommendations.push('Create a detailed task timeline and address blocked tasks immediately');
    }
    
    return {
      summary,
      factors: sortedFactors,
      calculationSteps,
      recommendations,
      lastUpdated: new Date(),
      confidence: 0.8
    };
  }

  /**
   * Calculate confidence level based on available data
   * @param {Object} profile - User profile
   * @param {Object} college - College data
   * @returns {number} Confidence 0-1
   */
  static calculateConfidence(profile, college) {
    let dataPoints = 0;
    let availablePoints = 0;
    
    // Profile data points
    const profileFields = ['gpa', 'satTotal', 'actComposite', 'activitiesCount'];
    profileFields.forEach(field => {
      dataPoints++;
      if (profile[field]) availablePoints++;
    });
    
    // College data points
    const collegeFields = ['averageGpa', 'satRange', 'acceptanceRate', 'tuitionInternational'];
    collegeFields.forEach(field => {
      dataPoints++;
      if (college[field]) availablePoints++;
    });
    
    return dataPoints > 0 ? availablePoints / dataPoints : 0.5;
  }

  /**
   * Normalize GPA to 4.0 scale
   * @param {number} gpa - GPA value
   * @param {string} scale - Scale type ('4.0', '5.0', '10.0', 'percentage')
   * @returns {number} Normalized GPA on 4.0 scale
   */
  static normalizeGPA(gpa, scale) {
    switch (scale) {
      case '5.0':
        return (gpa / 5.0) * 4.0;
      case '10.0':
        return (gpa / 10.0) * 4.0;
      case 'percentage':
      case '100':
        return (gpa / 100) * 4.0;
      case '4.0':
      default:
        return gpa;
    }
  }

  /**
   * Parse SAT range string
   * @param {string} range - e.g., "1400-1550"
   * @returns {number[]} [min, max]
   */
  static parseSATRange(range) {
    if (!range) return [0, 1600];
    const parts = range.split('-').map(s => parseInt(s.trim()));
    return parts.length === 2 ? parts : [parts[0] || 0, parts[0] || 1600];
  }

  /**
   * Parse ACT range string
   * @param {string} range - e.g., "32-35"
   * @returns {number[]} [min, max]
   */
  static parseACTRange(range) {
    if (!range) return [0, 36];
    const parts = range.split('-').map(s => parseInt(s.trim()));
    return parts.length === 2 ? parts : [parts[0] || 0, parts[0] || 36];
  }

  /**
   * Get user profile with all relevant data
   * @param {number} userId - User ID
   * @returns {Object} User profile
   */
  static async getUserProfile(userId) {
    const db = dbManager.getDatabase();
    
    // Get main profile
    const profile = db.prepare(`
      SELECT 
        sp.*,
        u.email,
        u.max_budget_per_year,
        u.need_financial_aid
      FROM student_profiles sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.user_id = ?
    `).get(userId);
    
    if (!profile) {
      // Try to get basic user info
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      return user ? { ...user, gpa: user.gpa, budgetMax: user.max_budget_per_year } : null;
    }
    
    // Get activity stats
    const activityStats = db.prepare(`
      SELECT 
        COUNT(*) as activitiesCount,
        AVG(tier_rating) as avgActivityTier
      FROM student_activities
      WHERE student_id = ?
    `).get(profile.id);
    
    // Get awards count
    const awardStats = db.prepare(`
      SELECT COUNT(*) as awardsCount
      FROM student_awards
      WHERE student_id = ?
    `).get(profile.id);
    
    return {
      ...profile,
      gpa: profile.gpa_weighted || profile.gpa_unweighted,
      gpaScale: profile.gpa_scale || '4.0',
      satTotal: profile.sat_total,
      actComposite: profile.act_composite,
      activitiesCount: activityStats?.activitiesCount || 0,
      avgActivityTier: activityStats?.avgActivityTier || 4,
      awardsCount: awardStats?.awardsCount || 0,
      intendedMajors: profile.intended_majors,
      budgetMax: profile.budget_max,
      needFinancialAid: profile.need_financial_aid
    };
  }

  /**
   * Get college data with all relevant fields
   * @param {number} collegeId - College ID
   * @returns {Object} College data
   */
  static async getCollegeData(collegeId) {
    const db = dbManager.getDatabase();
    
    const college = db.prepare('SELECT * FROM colleges WHERE id = ?').get(collegeId);
    
    if (!college) return null;
    
    return {
      ...college,
      averageGpa: college.average_gpa,
      satRange: college.sat_range,
      actRange: college.act_range,
      acceptanceRate: college.acceptance_rate,
      tuitionDomestic: college.tuition_domestic,
      tuitionInternational: college.tuition_international,
      majorCategories: college.major_categories
    };
  }

  /**
   * Get user's custom weights or defaults
   * @param {number} userId - User ID
   * @returns {Object} Weights
   */
  static async getUserWeights(userId) {
    const db = dbManager.getDatabase();
    
    try {
      const weights = db.prepare(`
        SELECT * FROM user_custom_weights WHERE user_id = ?
      `).get(userId);
      
      if (weights) {
        return {
          academic: weights.weight_academic,
          profile: weights.weight_profile,
          financial: weights.weight_financial,
          timeline: weights.weight_timeline
        };
      }
    } catch (error) {
      // Table might not exist yet
    }
    
    return this.DEFAULT_WEIGHTS;
  }

  /**
   * Cache the fit classification result
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @param {Object} result - Classification result
   */
  static async cacheResult(userId, collegeId, result) {
    const db = dbManager.getDatabase();
    
    try {
      // Check if table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='college_fits'
      `).get();
      
      if (!tableExists) {
        logger.debug('college_fits table does not exist, skipping cache');
        return;
      }
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days
      
      db.prepare(`
        INSERT OR REPLACE INTO college_fits (
          user_id, college_id, fit_category, overall_score, confidence,
          academic_fit_score, profile_fit_score, financial_fit_score, timeline_fit_score,
          calculated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `).run(
        userId,
        collegeId,
        result.fitCategory,
        result.overallScore,
        result.confidence,
        result.academicFit.score,
        result.profileFit.score,
        result.financialFit.score,
        result.timelineFit.score,
        expiresAt.toISOString()
      );
      
      // Also save explanation
      const fitRow = db.prepare(`
        SELECT id FROM college_fits WHERE user_id = ? AND college_id = ?
      `).get(userId, collegeId);
      
      if (fitRow) {
        db.prepare(`
          INSERT OR REPLACE INTO fit_explanations (
            college_fit_id, summary, factors, calculation_steps, recommendations
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          fitRow.id,
          result.explanation.summary,
          JSON.stringify(result.explanation.factors),
          JSON.stringify(result.explanation.calculationSteps),
          JSON.stringify(result.explanation.recommendations)
        );
      }
    } catch (error) {
      logger.warn('Could not cache fit result:', error.message);
    }
  }

  /**
   * Get cached fit classification if available and not expired
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Object|null} Cached result or null
   */
  static async getCachedFit(userId, collegeId) {
    const db = dbManager.getDatabase();
    
    try {
      const cached = db.prepare(`
        SELECT cf.*, fe.summary, fe.factors, fe.calculation_steps, fe.recommendations
        FROM college_fits cf
        LEFT JOIN fit_explanations fe ON fe.college_fit_id = cf.id
        WHERE cf.user_id = ? AND cf.college_id = ? AND cf.expires_at > datetime('now')
      `).get(userId, collegeId);
      
      if (cached) {
        return {
          fitCategory: cached.fit_category,
          overallScore: cached.overall_score,
          confidence: cached.confidence,
          academicFit: { score: cached.academic_fit_score },
          profileFit: { score: cached.profile_fit_score },
          financialFit: { score: cached.financial_fit_score },
          timelineFit: { score: cached.timeline_fit_score },
          explanation: {
            summary: cached.summary,
            factors: JSON.parse(cached.factors || '[]'),
            calculationSteps: JSON.parse(cached.calculation_steps || '[]'),
            recommendations: JSON.parse(cached.recommendations || '[]')
          },
          fromCache: true
        };
      }
    } catch (error) {
      logger.debug('Could not get cached fit:', error.message);
    }
    
    return null;
  }

  /**
   * Classify multiple colleges for a user (batch operation)
   * @param {number} userId - User ID
   * @param {number[]} collegeIds - Array of college IDs
   * @returns {Promise<Object[]>} Array of fit classifications
   */
  static async classifyColleges(userId, collegeIds) {
    const results = [];
    
    for (const collegeId of collegeIds) {
      try {
        // Try cache first
        let result = await this.getCachedFit(userId, collegeId);
        
        if (!result) {
          result = await this.classifyCollege(userId, collegeId);
        }
        
        results.push({
          collegeId,
          ...result
        });
      } catch (error) {
        logger.error(`Failed to classify college ${collegeId}:`, error);
        results.push({
          collegeId,
          error: error.message,
          fitCategory: 'unknown'
        });
      }
    }
    
    return results;
  }
}

module.exports = FitClassificationService;
