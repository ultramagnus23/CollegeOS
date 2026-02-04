/**
 * AutoDetectionService - Magic automation for CollegeOS
 * Auto-detects curriculum, school type, and other information from user input
 */

const logger = require('../utils/logger');

// School name patterns for curriculum detection
const CURRICULUM_PATTERNS = {
  CBSE: [
    'kendriya vidyalaya', 'kv', 'dps', 'delhi public school', 'dav', 
    'amity', 'modern school', 'springdales', 'mother\'s international',
    'venkateshwar', 'mount carmel', 'ryan', 'air force', 'army public',
    'navy children', 'birla', 'bal bharati', 'st. mark\'s', 'sanskriti',
    'vasant valley', 'cambridge school', 'gd goenka', 'lotus valley'
  ],
  ICSE: [
    'la martiniere', 'st. xavier\'s', 'don bosco', 'loyola', 
    'bishop cotton', 'st. james', 'st. paul\'s', 'cathedral',
    'frank anthony', 'campion', 'jamnabai', 'bombay scottish',
    'st. columba\'s', 'st. joseph\'s', 'st. mary\'s'
  ],
  IB: [
    'international school', 'world school', 'ib school', 'pathways',
    'oberoi international', 'american school', 'british school',
    'american embassy', 'woodstock', 'kodaikanal', 'mahindra uwc',
    'dps international', 'inventure academy', 'greenwood high'
  ],
  'A-Levels': [
    'british school', 'cambridge international', 'pearson', 'cie',
    'edexcel', 'osc', 'scottish high', 'heritage xperiential'
  ],
  'State Board': [
    'government school', 'state school', 'matriculation', 'hsc',
    'maharashtra board', 'karnataka board', 'tamil nadu board'
  ]
};

// Country patterns for location detection
const COUNTRY_INDICATORS = {
  'India': ['delhi', 'mumbai', 'bangalore', 'chennai', 'hyderabad', 'kolkata', 'pune', 'ahmedabad', 'jaipur', 'lucknow', 'noida', 'gurgaon', 'gurugram'],
  'USA': ['new york', 'california', 'texas', 'florida', 'chicago', 'los angeles', 'san francisco', 'boston', 'seattle'],
  'UK': ['london', 'manchester', 'birmingham', 'leeds', 'oxford', 'cambridge', 'edinburgh', 'bristol'],
  'UAE': ['dubai', 'abu dhabi', 'sharjah', 'ajman'],
  'Singapore': ['singapore']
};

// IELTS/TOEFL exemption rules by country and curriculum
const ENGLISH_EXEMPTION_RULES = {
  // UK universities
  'UK': {
    exemptCurriculums: ['A-Levels', 'ICSE', 'CBSE'],
    conditions: {
      'A-Levels': 'English medium instruction certificate',
      'ICSE': 'English score >= 70%',
      'CBSE': 'English medium instruction certificate required'
    }
  },
  // EU universities (common rules)
  'Netherlands': {
    exemptCurriculums: ['IB', 'A-Levels', 'CBSE', 'ICSE'],
    conditions: {
      'IB': 'English A or B at HL/SL',
      'A-Levels': 'English as first language',
      'CBSE': 'English medium + 70%+ in English',
      'ICSE': 'English >= 70%'
    }
  },
  'Germany': {
    exemptCurriculums: ['IB', 'A-Levels'],
    conditions: {
      'IB': 'English A or B at HL',
      'A-Levels': 'English language at A or B grade'
    }
  },
  'Singapore': {
    exemptCurriculums: ['CBSE', 'ICSE', 'IB', 'A-Levels'],
    conditions: {
      'default': 'English medium instruction for past 4+ years'
    }
  },
  'Canada': {
    exemptCurriculums: ['CBSE', 'ICSE', 'IB'],
    conditions: {
      'default': 'English medium instruction certificate'
    }
  },
  'United States': {
    exemptCurriculums: [], // US typically requires TOEFL/IELTS for international students
    conditions: {}
  }
};

// Application system requirements by country
const APPLICATION_SYSTEMS = {
  'United States': {
    systems: ['Common App', 'Coalition App', 'Direct Application'],
    defaultSystem: 'Common App',
    requiresSAT: true,
    requiresTOEFL: true
  },
  'United Kingdom': {
    systems: ['UCAS'],
    defaultSystem: 'UCAS',
    requiresIELTS: true,
    maxApplications: 5
  },
  'Germany': {
    systems: ['Uni-Assist', 'Direct Application'],
    defaultSystem: 'Uni-Assist',
    requiresTestDAF: true
  },
  'Netherlands': {
    systems: ['Studielink'],
    defaultSystem: 'Studielink',
    requiresIELTS: true
  },
  'Canada': {
    systems: ['OUAC', 'Direct Application'],
    defaultSystem: 'OUAC',
    requiresTOEFL: true
  },
  'India': {
    systems: ['JEE', 'NEET', 'CUET', 'Direct Application'],
    defaultSystem: 'Direct Application',
    requiresEntranceExam: true
  },
  'Singapore': {
    systems: ['Direct Application'],
    defaultSystem: 'Direct Application',
    requiresSAT: true
  },
  'Australia': {
    systems: ['UAC', 'VTAC', 'Direct Application'],
    defaultSystem: 'UAC',
    requiresIELTS: true
  }
};

class AutoDetectionService {
  /**
   * Detect curriculum from school name
   * @param {string} schoolName - The name of the school
   * @returns {object} - { curriculum, confidence, alternatives }
   */
  static detectCurriculum(schoolName) {
    if (!schoolName) {
      return { curriculum: null, confidence: 0, alternatives: [] };
    }

    const normalizedName = schoolName.toLowerCase().trim();
    const matches = [];

    for (const [curriculum, patterns] of Object.entries(CURRICULUM_PATTERNS)) {
      for (const pattern of patterns) {
        if (normalizedName.includes(pattern)) {
          matches.push({
            curriculum,
            pattern,
            confidence: this._calculateConfidence(normalizedName, pattern)
          });
        }
      }
    }

    if (matches.length === 0) {
      // Default to CBSE for Indian schools without clear indicators
      return {
        curriculum: null,
        confidence: 0,
        alternatives: Object.keys(CURRICULUM_PATTERNS),
        suggestion: 'Please select your curriculum'
      };
    }

    // Sort by confidence and return best match
    matches.sort((a, b) => b.confidence - a.confidence);
    
    return {
      curriculum: matches[0].curriculum,
      confidence: matches[0].confidence,
      matchedPattern: matches[0].pattern,
      alternatives: matches.slice(1).map(m => m.curriculum)
    };
  }

  /**
   * Detect country from school name or city
   * @param {string} location - School name, city, or address
   * @returns {object} - { country, confidence }
   */
  static detectCountry(location) {
    if (!location) {
      return { country: null, confidence: 0 };
    }

    const normalizedLocation = location.toLowerCase().trim();

    for (const [country, indicators] of Object.entries(COUNTRY_INDICATORS)) {
      for (const indicator of indicators) {
        if (normalizedLocation.includes(indicator)) {
          return {
            country,
            confidence: 0.9,
            matchedIndicator: indicator
          };
        }
      }
    }

    return { country: null, confidence: 0 };
  }

  /**
   * Check if student is exempt from English proficiency tests
   * @param {object} profile - Student profile with curriculum and country info
   * @param {string} targetCountry - Country of the college
   * @returns {object} - Exemption status and requirements
   */
  static checkEnglishExemption(profile, targetCountry) {
    const { curriculum, englishScore, englishMedium } = profile;
    
    const rules = ENGLISH_EXEMPTION_RULES[targetCountry];
    
    if (!rules) {
      return {
        exempt: false,
        reason: 'No exemption rules available for this country',
        testsRequired: ['IELTS', 'TOEFL']
      };
    }

    if (!rules.exemptCurriculums.includes(curriculum)) {
      return {
        exempt: false,
        reason: `${curriculum} curriculum not eligible for exemption in ${targetCountry}`,
        testsRequired: ['IELTS', 'TOEFL']
      };
    }

    // Get specific condition for this curriculum
    const condition = rules.conditions[curriculum] || rules.conditions['default'];
    
    // Check if conditions are met
    const conditionsMet = this._checkExemptionConditions(profile, condition);

    return {
      exempt: conditionsMet.met,
      reason: conditionsMet.reason,
      condition,
      proofRequired: conditionsMet.proof,
      testsRequired: conditionsMet.met ? [] : ['IELTS', 'TOEFL']
    };
  }

  /**
   * Get application system requirements for a country
   * @param {string} country - Target country
   * @returns {object} - Application system details
   */
  static getApplicationSystem(country) {
    const system = APPLICATION_SYSTEMS[country];
    
    if (!system) {
      return {
        systems: ['Direct Application'],
        defaultSystem: 'Direct Application',
        unknown: true
      };
    }

    return system;
  }

  /**
   * Auto-generate recommended actions based on profile
   * @param {object} profile - Student profile
   * @returns {array} - List of recommended actions
   */
  static generateRecommendedActions(profile) {
    const actions = [];
    const now = new Date();
    const currentMonth = now.getMonth();

    // Profile completeness checks
    if (!profile.gpa) {
      actions.push({
        priority: 'high',
        category: 'profile',
        action: 'Add your GPA/grades',
        reason: 'Required for college matching',
        impact: 'Unlocks personalized college recommendations'
      });
    }

    if (!profile.satScore && !profile.actScore) {
      actions.push({
        priority: 'medium',
        category: 'testing',
        action: 'Add standardized test scores',
        reason: 'SAT/ACT scores improve matching accuracy',
        impact: 'Better reach/target/safety classification'
      });
    }

    if (!profile.activities || profile.activities.length === 0) {
      actions.push({
        priority: 'medium',
        category: 'profile',
        action: 'Add extracurricular activities',
        reason: 'Activities show holistic profile strength',
        impact: 'More accurate admission chances'
      });
    }

    // Timeline-based recommendations
    if (profile.grade === 'Grade 11' || profile.grade === 'Grade 12') {
      if (currentMonth >= 8 && currentMonth <= 10) { // Sep-Nov
        actions.push({
          priority: 'high',
          category: 'essays',
          action: 'Start Common App essay',
          reason: 'Early Action deadlines approaching',
          impact: 'Strong essay significantly improves chances'
        });
      }

      if (currentMonth >= 9 && currentMonth <= 11) { // Oct-Dec
        actions.push({
          priority: 'high',
          category: 'applications',
          action: 'Request recommendation letters',
          reason: 'Teachers need 2-3 weeks to write',
          impact: 'Avoid last-minute requests'
        });
      }
    }

    // Sort by priority
    const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
    actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return actions;
  }

  /**
   * Calculate profile strength score
   * @param {object} profile - Student profile
   * @returns {object} - Strength score with breakdown
   */
  static calculateProfileStrength(profile) {
    let score = 0;
    const breakdown = {};
    const maxScores = {
      academics: 30,
      testing: 25,
      activities: 20,
      essays: 15,
      recommendations: 10
    };

    // Academics (30 points)
    if (profile.gpa) {
      const gpaScore = Math.min(profile.gpa / 4.0, 1) * 25;
      score += gpaScore;
      breakdown.academics = { score: Math.round(gpaScore), max: maxScores.academics, status: 'complete' };
    } else {
      breakdown.academics = { score: 0, max: maxScores.academics, status: 'missing' };
    }

    // Testing (25 points)
    if (profile.satScore || profile.actScore) {
      let testScore = 0;
      if (profile.satScore) {
        testScore = Math.min(profile.satScore / 1600, 1) * 25;
      } else if (profile.actScore) {
        testScore = Math.min(profile.actScore / 36, 1) * 25;
      }
      score += testScore;
      breakdown.testing = { score: Math.round(testScore), max: maxScores.testing, status: 'complete' };
    } else {
      breakdown.testing = { score: 0, max: maxScores.testing, status: 'optional' };
    }

    // Activities (20 points)
    if (profile.activities && profile.activities.length > 0) {
      const activityScore = Math.min(profile.activities.length / 10, 1) * 20;
      score += activityScore;
      breakdown.activities = { 
        score: Math.round(activityScore), 
        max: maxScores.activities, 
        status: profile.activities.length >= 5 ? 'complete' : 'partial',
        count: profile.activities.length
      };
    } else {
      breakdown.activities = { score: 0, max: maxScores.activities, status: 'missing', count: 0 };
    }

    // Essays (15 points) - placeholder
    breakdown.essays = { score: 0, max: maxScores.essays, status: 'not_started' };

    // Recommendations (10 points) - placeholder
    breakdown.recommendations = { score: 0, max: maxScores.recommendations, status: 'not_started' };

    return {
      score: Math.round(score),
      maxScore: 100,
      percentage: Math.round(score),
      breakdown,
      level: score >= 80 ? 'strong' : score >= 60 ? 'good' : score >= 40 ? 'developing' : 'needs_work',
      recommendations: this._getStrengthRecommendations(breakdown)
    };
  }

  /**
   * Auto-generate college list based on profile
   * @param {object} profile - Student profile
   * @param {object} options - Options for list generation
   * @returns {object} - Recommended college distribution
   */
  static generateCollegeListStrategy(profile, options = {}) {
    const { targetCount = 10, preferredCountries = ['United States'] } = options;

    // Calculate ideal distribution
    const distribution = {
      safety: Math.round(targetCount * 0.2),  // 20% safety
      target: Math.round(targetCount * 0.5),  // 50% target
      reach: Math.round(targetCount * 0.3)    // 30% reach
    };

    // Adjust based on profile strength
    const strength = this.calculateProfileStrength(profile);
    
    if (strength.level === 'strong') {
      // Strong profile can have more reach schools
      distribution.reach = Math.round(targetCount * 0.4);
      distribution.target = Math.round(targetCount * 0.4);
      distribution.safety = Math.round(targetCount * 0.2);
    } else if (strength.level === 'developing' || strength.level === 'needs_work') {
      // Weaker profile should have more safety schools
      distribution.safety = Math.round(targetCount * 0.3);
      distribution.target = Math.round(targetCount * 0.5);
      distribution.reach = Math.round(targetCount * 0.2);
    }

    return {
      distribution,
      totalRecommended: targetCount,
      strategy: this._generateStrategyText(profile, distribution),
      considerations: this._getListConsiderations(profile, preferredCountries)
    };
  }

  // Private helper methods
  static _calculateConfidence(text, pattern) {
    // Exact match = higher confidence
    if (text === pattern) return 1.0;
    // Pattern at start = higher confidence
    if (text.startsWith(pattern)) return 0.95;
    // Pattern found = moderate confidence
    return 0.8;
  }

  static _checkExemptionConditions(profile, condition) {
    const { englishScore, englishMedium } = profile;

    if (condition.includes('medium')) {
      if (englishMedium) {
        return {
          met: true,
          reason: 'English medium instruction verified',
          proof: ['English Medium Certificate from school']
        };
      }
      return {
        met: false,
        reason: 'English medium instruction not verified',
        proof: ['Upload English Medium Certificate']
      };
    }

    if (condition.includes('%')) {
      const requiredScore = parseInt(condition.match(/(\d+)%/)?.[1] || 70);
      if (englishScore && englishScore >= requiredScore) {
        return {
          met: true,
          reason: `English score ${englishScore}% meets requirement of ${requiredScore}%`,
          proof: []
        };
      }
      return {
        met: false,
        reason: `English score below ${requiredScore}% requirement`,
        proof: ['Marksheet showing English score']
      };
    }

    return {
      met: false,
      reason: 'Conditions need manual verification',
      proof: ['Contact admissions office']
    };
  }

  static _getStrengthRecommendations(breakdown) {
    const recommendations = [];

    if (breakdown.academics.status === 'missing') {
      recommendations.push('Add your GPA to unlock personalized recommendations');
    }
    if (breakdown.testing.status === 'optional' || breakdown.testing.status === 'missing') {
      recommendations.push('Consider adding test scores for more accurate matching');
    }
    if (breakdown.activities.status === 'missing' || breakdown.activities.count < 5) {
      recommendations.push('Add more activities to strengthen your profile');
    }
    if (breakdown.essays.status === 'not_started') {
      recommendations.push('Start working on your personal essay');
    }

    return recommendations;
  }

  static _generateStrategyText(profile, distribution) {
    const strength = this.calculateProfileStrength(profile);
    
    if (strength.level === 'strong') {
      return `Your strong profile allows you to aim high! We recommend ${distribution.reach} reach schools, ${distribution.target} target schools, and ${distribution.safety} safety schools for a balanced list.`;
    } else if (strength.level === 'good') {
      return `Your profile is competitive. Focus on ${distribution.target} target schools where you have strong chances, with ${distribution.reach} reach schools and ${distribution.safety} safety schools.`;
    } else {
      return `Build a balanced list with ${distribution.safety} safety schools to ensure options, ${distribution.target} target schools, and ${distribution.reach} reach schools for aspirational goals.`;
    }
  }

  static _getListConsiderations(profile, preferredCountries) {
    const considerations = [];

    if (preferredCountries.includes('United Kingdom')) {
      considerations.push('UK allows only 5 UCAS applications - choose carefully');
    }
    if (preferredCountries.includes('Germany')) {
      considerations.push('German universities may require language proficiency in German');
    }
    if (preferredCountries.length > 2) {
      considerations.push('Applying to multiple countries requires managing different deadlines and systems');
    }

    return considerations;
  }
}

module.exports = AutoDetectionService;
