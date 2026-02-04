/**
 * SmartRecommendationService - Auto-generate college lists based on profile
 * Implements "magic" college discovery with reach/target/safety distribution
 */

const logger = require('../utils/logger');
const College = require('../models/College');

// College tiers by acceptance rate
const SELECTIVITY_TIERS = {
  HIGHLY_SELECTIVE: { min: 0, max: 15, label: 'Highly Selective' },
  VERY_SELECTIVE: { min: 15, max: 30, label: 'Very Selective' },
  SELECTIVE: { min: 30, max: 50, label: 'Selective' },
  MODERATE: { min: 50, max: 70, label: 'Moderately Selective' },
  OPEN: { min: 70, max: 100, label: 'Open Admission' }
};

// GPA thresholds for different selectivity levels
const GPA_THRESHOLDS = {
  HIGHLY_SELECTIVE: { safety: 4.0, target: 3.9, reach: 3.7 },
  VERY_SELECTIVE: { safety: 3.9, target: 3.7, reach: 3.5 },
  SELECTIVE: { safety: 3.7, target: 3.5, reach: 3.2 },
  MODERATE: { safety: 3.5, target: 3.2, reach: 2.8 },
  OPEN: { safety: 3.0, target: 2.5, reach: 2.0 }
};

class SmartRecommendationService {
  /**
   * Generate personalized college recommendations
   * @param {object} profile - Student profile
   * @param {object} preferences - User preferences (countries, majors, etc.)
   * @returns {object} - Recommendations with reach/target/safety
   */
  static async generateRecommendations(profile, preferences = {}) {
    try {
      const {
        targetCountries = ['United States'],
        majors = [],
        budgetMax = null,
        campusSize = null,
        location = null
      } = preferences;

      // Get all colleges matching basic criteria
      const filters = this._buildFilters(targetCountries, majors, budgetMax);
      const allColleges = await College.findAll(filters);

      if (allColleges.length === 0) {
        return {
          recommendations: [],
          message: 'No colleges match your criteria. Try expanding your filters.',
          filters: filters
        };
      }

      // Classify each college as reach/target/safety
      const classified = this._classifyColleges(allColleges, profile);

      // Select balanced distribution
      const distribution = this._selectBalancedList(classified, {
        totalCount: preferences.targetCount || 15,
        safetyRatio: 0.2,
        targetRatio: 0.5,
        reachRatio: 0.3
      });

      // Generate explanations
      const recommendations = distribution.map(college => ({
        ...college,
        explanation: this._generateExplanation(college, profile),
        matchScore: this._calculateMatchScore(college, profile, preferences)
      }));

      // Sort by match score within each category
      const sorted = this._sortByCategory(recommendations);

      return {
        recommendations: sorted,
        summary: this._generateSummary(classified, profile),
        distribution: {
          safety: sorted.filter(c => c.category === 'safety').length,
          target: sorted.filter(c => c.category === 'target').length,
          reach: sorted.filter(c => c.category === 'reach').length
        }
      };
    } catch (error) {
      logger.error('Failed to generate recommendations:', error);
      throw error;
    }
  }

  /**
   * Get "Similar to" recommendations
   * @param {string} collegeId - Reference college ID
   * @param {object} profile - Student profile
   * @returns {array} - Similar colleges
   */
  static async getSimilarColleges(collegeId, profile) {
    try {
      const reference = await College.findById(collegeId);
      if (!reference) {
        return [];
      }

      const filters = {
        country: reference.country,
        limit: 50
      };

      const candidates = await College.findAll(filters);

      // Score similarity
      const scored = candidates
        .filter(c => c.id !== collegeId)
        .map(college => ({
          ...college,
          similarity: this._calculateSimilarity(reference, college)
        }))
        .filter(c => c.similarity > 0.6)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);

      return scored.map(c => ({
        ...c,
        reason: this._getSimilarityReason(reference, c)
      }));
    } catch (error) {
      logger.error('Failed to get similar colleges:', error);
      throw error;
    }
  }

  /**
   * Auto-suggest based on browsing behavior
   * @param {array} viewedColleges - Recently viewed college IDs
   * @param {object} profile - Student profile
   * @returns {array} - Suggested colleges
   */
  static async suggestFromBehavior(viewedColleges, profile) {
    if (!viewedColleges || viewedColleges.length === 0) {
      return [];
    }

    try {
      // Analyze patterns in viewed colleges
      const patterns = await this._analyzeViewingPatterns(viewedColleges);

      // Find colleges matching patterns
      const suggestions = await this._findMatchingColleges(patterns, viewedColleges);

      return suggestions.map(college => ({
        ...college,
        suggestReason: this._getSuggestionReason(patterns, college)
      }));
    } catch (error) {
      logger.error('Failed to generate behavior-based suggestions:', error);
      return [];
    }
  }

  /**
   * Get instant recommendations after onboarding
   * @param {object} profile - Newly created profile
   * @returns {object} - Quick recommendations
   */
  static async getInstantRecommendations(profile) {
    const { gpa, satScore, actScore, preferredCountries = ['United States'] } = profile;

    // Quick classification based on stats
    let tier = 'MODERATE';
    
    if (gpa >= 3.9 || satScore >= 1500 || actScore >= 34) {
      tier = 'HIGHLY_SELECTIVE';
    } else if (gpa >= 3.7 || satScore >= 1400 || actScore >= 32) {
      tier = 'VERY_SELECTIVE';
    } else if (gpa >= 3.5 || satScore >= 1300 || actScore >= 29) {
      tier = 'SELECTIVE';
    }

    // Get tier information for current tier
    const tierInfo = SELECTIVITY_TIERS[tier];
    // Note: lowerTier and higherTier could be used for adjacent tier recommendations
    // but are not currently implemented in this version

    const recommendations = {
      profile_strength: this._assessProfileStrength(profile),
      suggested_tier: tierInfo.label,
      sample_reaches: [],
      sample_targets: [],
      sample_safeties: [],
      next_steps: this._getNextSteps(profile)
    };

    try {
      // Fetch sample colleges for each category
      const allColleges = await College.findAll({ 
        country: preferredCountries[0],
        limit: 100 
      });

      // Categorize and sample
      for (const college of allColleges) {
        const ar = college.acceptance_rate || 50;
        const category = this._categorizeByStats(college, profile);
        
        if (category === 'reach' && recommendations.sample_reaches.length < 5) {
          recommendations.sample_reaches.push({
            id: college.id,
            name: college.name,
            acceptance_rate: ar,
            why: 'Selective school that matches your ambitions'
          });
        } else if (category === 'target' && recommendations.sample_targets.length < 5) {
          recommendations.sample_targets.push({
            id: college.id,
            name: college.name,
            acceptance_rate: ar,
            why: 'Good fit for your academic profile'
          });
        } else if (category === 'safety' && recommendations.sample_safeties.length < 3) {
          recommendations.sample_safeties.push({
            id: college.id,
            name: college.name,
            acceptance_rate: ar,
            why: 'Strong chances of admission'
          });
        }
      }
    } catch (error) {
      logger.error('Failed to fetch instant recommendations:', error);
    }

    return recommendations;
  }

  // Private helper methods

  static _buildFilters(countries, majors, budgetMax) {
    const filters = {};
    
    if (countries && countries.length > 0) {
      filters.countries = countries;
    }
    
    if (majors && majors.length > 0) {
      filters.majors = majors;
    }
    
    if (budgetMax) {
      filters.maxCost = budgetMax;
    }

    return filters;
  }

  static _classifyColleges(colleges, profile) {
    const classified = {
      reach: [],
      target: [],
      safety: [],
      unrealistic: []
    };

    for (const college of colleges) {
      const category = this._categorizeByStats(college, profile);
      if (classified[category]) {
        classified[category].push({
          ...college,
          category
        });
      }
    }

    return classified;
  }

  static _categorizeByStats(college, profile) {
    const ar = college.acceptance_rate || 50;
    const collegeAvgGPA = college.avg_gpa || college.average_gpa || 3.5;
    const userGPA = profile.gpa || profile.currentGPA || 3.0;

    // Hard caps based on acceptance rate
    if (ar <= 10) {
      return 'reach'; // Always reach for highly selective
    }

    // Calculate based on GPA comparison
    const gpaDiff = userGPA - collegeAvgGPA;

    if (gpaDiff >= 0.3 && ar >= 40) {
      return 'safety';
    } else if (gpaDiff >= -0.2 || ar >= 60) {
      return 'target';
    } else if (gpaDiff >= -0.5 || ar >= 30) {
      return 'reach';
    } else {
      return 'unrealistic';
    }
  }

  static _selectBalancedList(classified, options) {
    const { totalCount, safetyRatio, targetRatio, reachRatio } = options;

    const safetyCount = Math.max(2, Math.round(totalCount * safetyRatio));
    const targetCount = Math.round(totalCount * targetRatio);
    const reachCount = Math.round(totalCount * reachRatio);

    const selected = [];

    // Select from each category
    selected.push(...classified.safety.slice(0, safetyCount));
    selected.push(...classified.target.slice(0, targetCount));
    selected.push(...classified.reach.slice(0, reachCount));

    // Fill remaining slots if any category is short
    const remaining = totalCount - selected.length;
    if (remaining > 0) {
      const extras = [
        ...classified.target.slice(targetCount),
        ...classified.safety.slice(safetyCount)
      ].slice(0, remaining);
      selected.push(...extras);
    }

    return selected;
  }

  static _calculateMatchScore(college, profile, preferences) {
    let score = 50; // Base score

    // Academic fit
    const userGPA = profile.gpa || profile.currentGPA || 3.0;
    const collegeGPA = college.avg_gpa || college.average_gpa || 3.5;
    const gpaDiff = userGPA - collegeGPA;
    
    if (gpaDiff >= 0.3) score += 20;
    else if (gpaDiff >= 0) score += 10;
    else if (gpaDiff >= -0.3) score += 5;

    // Test score fit
    if (profile.satScore && college.sat_avg) {
      const satDiff = profile.satScore - college.sat_avg;
      if (satDiff >= 50) score += 15;
      else if (satDiff >= 0) score += 10;
      else if (satDiff >= -50) score += 5;
    }

    // Major availability
    if (preferences.majors && preferences.majors.length > 0) {
      const collegeMajors = college.major_categories || [];
      const hasMatch = preferences.majors.some(m => 
        collegeMajors.some(cm => cm.toLowerCase().includes(m.toLowerCase()))
      );
      if (hasMatch) score += 10;
    }

    // Location preference
    if (preferences.location && college.state) {
      if (college.state.toLowerCase().includes(preferences.location.toLowerCase())) {
        score += 5;
      }
    }

    return Math.min(100, Math.max(0, score));
  }

  static _generateExplanation(college, profile) {
    const category = college.category;
    const userGPA = profile.gpa || profile.currentGPA || 3.0;
    const ar = college.acceptance_rate || 50;

    const explanations = {
      safety: [
        `With your ${userGPA} GPA, you're above the average at ${college.name}.`,
        `${college.name} has a ${ar}% acceptance rate, making it a strong option.`,
        `Your profile is competitive for ${college.name}'s admissions.`
      ],
      target: [
        `${college.name} is a good fit for your academic profile.`,
        `Your credentials align well with ${college.name}'s typical admits.`,
        `You have a solid chance at ${college.name} with focused preparation.`
      ],
      reach: [
        `${college.name} is selective (${ar}% acceptance), but achievable with a strong application.`,
        `Your profile puts you in the competitive range for ${college.name}.`,
        `${college.name} values holistic review - essays and activities matter.`
      ]
    };

    return explanations[category]?.[Math.floor(Math.random() * explanations[category].length)] 
      || 'Consider this school for your list.';
  }

  static _generateSummary(classified, profile) {
    const total = classified.reach.length + classified.target.length + classified.safety.length;
    const userGPA = profile.gpa || 3.0;

    return {
      totalMatches: total,
      reachCount: classified.reach.length,
      targetCount: classified.target.length,
      safetyCount: classified.safety.length,
      profileAssessment: userGPA >= 3.7 
        ? 'Your strong academics open many options.'
        : userGPA >= 3.3 
          ? 'You have competitive options across tiers.'
          : 'Focus on building a balanced list with solid safeties.'
    };
  }

  static _sortByCategory(recommendations) {
    const categoryOrder = { safety: 0, target: 1, reach: 2 };
    return recommendations.sort((a, b) => {
      if (categoryOrder[a.category] !== categoryOrder[b.category]) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      return b.matchScore - a.matchScore;
    });
  }

  static _calculateSimilarity(ref, candidate) {
    let similarity = 0;
    let factors = 0;

    // Acceptance rate similarity
    if (ref.acceptance_rate && candidate.acceptance_rate) {
      const arDiff = Math.abs(ref.acceptance_rate - candidate.acceptance_rate);
      similarity += Math.max(0, 1 - arDiff / 30);
      factors++;
    }

    // Size similarity
    if (ref.student_population && candidate.student_population) {
      const sizeDiff = Math.abs(ref.student_population - candidate.student_population) / ref.student_population;
      similarity += Math.max(0, 1 - sizeDiff);
      factors++;
    }

    // Same type (public/private)
    if (ref.type === candidate.type) {
      similarity += 1;
      factors++;
    }

    // Cost similarity
    if (ref.tuition_out_of_state && candidate.tuition_out_of_state) {
      const costDiff = Math.abs(ref.tuition_out_of_state - candidate.tuition_out_of_state) / ref.tuition_out_of_state;
      similarity += Math.max(0, 1 - costDiff);
      factors++;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  static _getSimilarityReason(ref, candidate) {
    const reasons = [];
    
    if (Math.abs((ref.acceptance_rate || 50) - (candidate.acceptance_rate || 50)) < 10) {
      reasons.push('Similar selectivity');
    }
    if (ref.type === candidate.type) {
      reasons.push(`Both are ${ref.type} universities`);
    }
    if (ref.state === candidate.state) {
      reasons.push(`Located in the same state`);
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Similar profile';
  }

  static async _analyzeViewingPatterns(viewedColleges) {
    try {
      const colleges = await Promise.all(
        viewedColleges.map(id => College.findById(id))
      );

      const validColleges = colleges.filter(c => c);
      
      // Analyze patterns
      const patterns = {
        avgAcceptanceRate: 0,
        preferredCountries: [],
        preferredTypes: [],
        avgCost: 0
      };

      if (validColleges.length > 0) {
        patterns.avgAcceptanceRate = validColleges.reduce((sum, c) => sum + (c.acceptance_rate || 50), 0) / validColleges.length;
        
        const countryCounts = {};
        const typeCounts = {};
        
        validColleges.forEach(c => {
          countryCounts[c.country] = (countryCounts[c.country] || 0) + 1;
          typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
        });

        patterns.preferredCountries = Object.entries(countryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([country]) => country);

        patterns.preferredTypes = Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([type]) => type);
      }

      return patterns;
    } catch (error) {
      logger.error('Failed to analyze viewing patterns:', error);
      return {};
    }
  }

  static async _findMatchingColleges(patterns, excludeIds) {
    try {
      const filters = {};
      
      if (patterns.preferredCountries?.length > 0) {
        filters.country = patterns.preferredCountries[0];
      }

      const colleges = await College.findAll(filters);
      
      return colleges
        .filter(c => !excludeIds.includes(c.id))
        .filter(c => {
          if (patterns.avgAcceptanceRate) {
            const arDiff = Math.abs((c.acceptance_rate || 50) - patterns.avgAcceptanceRate);
            return arDiff < 20;
          }
          return true;
        })
        .slice(0, 10);
    } catch (error) {
      logger.error('Failed to find matching colleges:', error);
      return [];
    }
  }

  static _getSuggestionReason(patterns, college) {
    const reasons = [];
    
    if (patterns.preferredCountries?.includes(college.country)) {
      reasons.push(`Based on your interest in ${college.country} schools`);
    }
    if (patterns.preferredTypes?.includes(college.type)) {
      reasons.push(`Similar to other ${college.type} schools you've viewed`);
    }
    if (patterns.avgAcceptanceRate) {
      const arDiff = Math.abs((college.acceptance_rate || 50) - patterns.avgAcceptanceRate);
      if (arDiff < 10) {
        reasons.push('Similar selectivity to schools you like');
      }
    }

    return reasons.length > 0 ? reasons[0] : 'Recommended for you';
  }

  static _assessProfileStrength(profile) {
    const gpa = profile.gpa || 3.0;
    const sat = profile.satScore || 0;
    const act = profile.actScore || 0;

    if (gpa >= 3.9 && (sat >= 1500 || act >= 34)) {
      return 'Very Strong - Competitive for top schools';
    } else if (gpa >= 3.7 && (sat >= 1400 || act >= 32)) {
      return 'Strong - Good chances at selective schools';
    } else if (gpa >= 3.5 && (sat >= 1300 || act >= 29)) {
      return 'Solid - Competitive for many schools';
    } else {
      return 'Building - Focus on target and safety schools';
    }
  }

  static _getNextSteps(profile) {
    const steps = [];

    if (!profile.satScore && !profile.actScore) {
      steps.push('Consider taking SAT or ACT for more options');
    }
    if (!profile.activities || profile.activities.length < 5) {
      steps.push('Add extracurricular activities to your profile');
    }
    steps.push('Start researching colleges that interest you');
    steps.push('Build a balanced list with reach, target, and safety schools');

    return steps;
  }
}

module.exports = SmartRecommendationService;
